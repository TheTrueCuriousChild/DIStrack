import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

vi.mock("../src/db/index.js", () => {
  const queryMock = vi.fn();
  const clientQueryMock = vi.fn();
  const clientReleaseMock = vi.fn();

  const connectMock = vi.fn().mockResolvedValue({
    query: clientQueryMock,
    release: clientReleaseMock,
  });

  return {
    pool: {
      query: queryMock,
      connect: connectMock,
    },
  };
});

describe("Shipment Endpoints (/api/v1/shipments)", () => {
  const testUserId = "11111111-1111-4111-8111-111111111111";
  const testFacilityId = "22222222-2222-4222-8222-222222222222";
  const otherFacilityId = "33333333-3333-4333-8333-333333333333";
  const testSupplyOrderId = "44444444-4444-4444-8444-444444444444";
  const testShipmentId = "55555555-5555-4555-8555-555555555555";

  const adminHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "admin",
    "x-facility-id": testFacilityId,
  };

  const vendorHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "vendor_staff",
    "x-facility-id": testFacilityId,
  };

  const hospitalHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "hospital_staff",
    "x-facility-id": testFacilityId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/shipments", () => {
    it("should return 403 when hospital_staff attempts to create a shipment", async () => {
      const res = await request(app).post("/api/v1/shipments").set(hospitalHeaders).send({
        supply_order_id: testSupplyOrderId,
      });

      expect(res.status).toBe(403);
    });

    it("should return 404 when supply order does not exist", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT supply_orders -> not found
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app).post("/api/v1/shipments").set(adminHeaders).send({
        supply_order_id: testSupplyOrderId,
      });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain("not found");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should return 403 when vendor_staff creates shipment for order of another facility", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: testSupplyOrderId,
              vendor_facility_id: otherFacilityId, // Mismatch!
              status: "confirmed",
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app).post("/api/v1/shipments").set(vendorHeaders).send({
        supply_order_id: testSupplyOrderId,
      });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("not authorized");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should return 409 when supply order is not confirmed", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: testSupplyOrderId,
              vendor_facility_id: testFacilityId,
              status: "created", // NOT confirmed!
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app).post("/api/v1/shipments").set(adminHeaders).send({
        supply_order_id: testSupplyOrderId,
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("Only 'confirmed' supply orders can be shipped");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should return 409 when an active shipment already exists for the order", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT supply_orders FOR UPDATE
          rows: [
            {
              id: testSupplyOrderId,
              vendor_facility_id: testFacilityId,
              status: "confirmed",
            },
          ],
        })
        .mockResolvedValueOnce({
          // SELECT existing shipments
          rows: [{ id: testShipmentId, status: "packing" }],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app).post("/api/v1/shipments").set(adminHeaders).send({
        supply_order_id: testSupplyOrderId,
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("already exists");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should create shipment and initial 'packing' event successfully (201)", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT supply_orders FOR UPDATE
          rows: [
            {
              id: testSupplyOrderId,
              vendor_facility_id: testFacilityId,
              status: "confirmed",
            },
          ],
        })
        .mockResolvedValueOnce({
          // SELECT existing shipments (none)
          rows: [],
        })
        .mockResolvedValueOnce({
          // INSERT shipments
          rows: [
            {
              id: testShipmentId,
              supply_order_id: testSupplyOrderId,
              tracking_number: "TRK-9988",
              status: "packing",
            },
          ],
        })
        .mockResolvedValueOnce({
          // INSERT shipment_events
          rows: [
            {
              id: "event-1",
              shipment_id: testShipmentId,
              status: "packing",
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app).post("/api/v1/shipments").set(vendorHeaders).send({
        supply_order_id: testSupplyOrderId,
        tracking_number: "TRK-9988",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shipment.status).toBe("packing");
      expect(res.body.data.initial_event.status).toBe("packing");
      expect(clientMock.release).toHaveBeenCalled();
    });
  });

  describe("PATCH /api/v1/shipments/:id/status", () => {
    it("should return 409 when invalid transition sequence is attempted", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT shipments FOR UPDATE
          rows: [
            {
              id: testShipmentId,
              vendor_facility_id: testFacilityId,
              status: "packing",
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      // Try skipping to delivered directly
      const res = await request(app)
        .patch(`/api/v1/shipments/${testShipmentId}/status`)
        .set(vendorHeaders)
        .send({
          status: "delivered",
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("Expected next status: 'dispatched'");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should update status forward to dispatched and record event (200)", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT shipments FOR UPDATE
          rows: [
            {
              id: testShipmentId,
              vendor_facility_id: testFacilityId,
              status: "packing",
            },
          ],
        })
        .mockResolvedValueOnce({
          // UPDATE shipments
          rows: [
            {
              id: testShipmentId,
              status: "dispatched",
              dispatched_at: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({
          // INSERT shipment_events
          rows: [
            {
              id: "event-2",
              shipment_id: testShipmentId,
              status: "dispatched",
              location: "Mumbai Central Warehouse",
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .patch(`/api/v1/shipments/${testShipmentId}/status`)
        .set(vendorHeaders)
        .send({
          status: "dispatched",
          location: "Mumbai Central Warehouse",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shipment.status).toBe("dispatched");
      expect(res.body.data.event.status).toBe("dispatched");
      expect(clientMock.release).toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/shipments/:id", () => {
    it("should return 404 when shipment not found", async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/api/v1/shipments/${testShipmentId}`).set(adminHeaders);

      expect(res.status).toBe(404);
    });

    it("should return shipment with timeline events (200)", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testShipmentId,
              supply_order_id: testSupplyOrderId,
              status: "in_transit",
              tracking_number: "TRK-12345",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "ev-1",
              shipment_id: testShipmentId,
              status: "packing",
              occurred_at: "2026-08-17T10:00:00Z",
            },
            {
              id: "ev-2",
              shipment_id: testShipmentId,
              status: "dispatched",
              occurred_at: "2026-08-17T12:00:00Z",
            },
            {
              id: "ev-3",
              shipment_id: testShipmentId,
              status: "in_transit",
              occurred_at: "2026-08-17T14:00:00Z",
            },
          ],
        });

      const res = await request(app).get(`/api/v1/shipments/${testShipmentId}`).set(adminHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testShipmentId);
      expect(res.body.data.events).toHaveLength(3);
    });
  });

  describe("GET /api/v1/shipments", () => {
    it("should return paginated shipments list", async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({
        rows: [
          {
            id: testShipmentId,
            supply_order_id: testSupplyOrderId,
            status: "packing",
          },
        ],
      });

      const res = await request(app).get("/api/v1/shipments?page=1&limit=20").set(hospitalHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.data).toHaveLength(1);
    });
  });
});
