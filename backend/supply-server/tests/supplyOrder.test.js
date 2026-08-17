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

describe("Supply Order Endpoints (/api/v1/supply-orders)", () => {
  const testUserId = "11111111-1111-4111-8111-111111111111";
  const testFacilityId = "22222222-2222-4222-8222-222222222222";
  const otherFacilityId = "33333333-3333-4333-8333-333333333333";
  const testVendorId = "44444444-4444-4444-8444-444444444444";
  const testDrugId = "55555555-5555-4555-8555-555555555555";
  const otherDrugId = "66666666-6666-4666-8666-666666666666";
  const testSupplyOrderId = "77777777-7777-4777-8777-777777777777";
  const testIndentItemId1 = "88888888-8888-4888-8888-888888888888";
  const testIndentItemId2 = "99999999-9999-4999-8999-999999999999";

  const adminHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "admin",
    "x-facility-id": testFacilityId,
  };

  const governmentHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "government",
    "x-facility-id": testFacilityId,
  };

  const hospitalHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "hospital_staff",
    "x-facility-id": testFacilityId,
  };

  const vendorHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "vendor_staff",
    "x-facility-id": testFacilityId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/supply-orders/aggregate", () => {
    it("should return 403 when hospital_staff attempts aggregation", async () => {
      const res = await request(app)
        .post("/api/v1/supply-orders/aggregate")
        .set(hospitalHeaders)
        .send({
          drug_id: testDrugId,
          vendor_id: testVendorId,
          indent_item_ids: [testIndentItemId1],
        });

      expect(res.status).toBe(403);
    });

    it("should return 400 when duplicate indent_item_ids are passed", async () => {
      const res = await request(app)
        .post("/api/v1/supply-orders/aggregate")
        .set(adminHeaders)
        .send({
          drug_id: testDrugId,
          vendor_id: testVendorId,
          indent_item_ids: [testIndentItemId1, testIndentItemId1],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
      expect(JSON.stringify(res.body.errors)).toContain("Duplicate indent_item_ids");
    });

    it("should return 400 when an indent item is missing / not found", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT vendors
          rows: [{ id: testVendorId, name: "Pharma Co", active: true }],
        })
        .mockResolvedValueOnce({
          // SELECT indent_items -> returns only 1 item while 2 were requested
          rows: [
            {
              id: testIndentItemId1,
              drug_id: testDrugId,
              quantity_approved: 500,
              status: "approved",
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .post("/api/v1/supply-orders/aggregate")
        .set(adminHeaders)
        .send({
          drug_id: testDrugId,
          vendor_id: testVendorId,
          indent_item_ids: [testIndentItemId1, testIndentItemId2],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("were not found");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should return 400 when an indent item is not in 'approved' status", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT vendors
          rows: [{ id: testVendorId, name: "Pharma Co", active: true }],
        })
        .mockResolvedValueOnce({
          // SELECT indent_items
          rows: [
            {
              id: testIndentItemId1,
              drug_id: testDrugId,
              quantity_approved: 500,
              status: "pending", // NOT approved!
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .post("/api/v1/supply-orders/aggregate")
        .set(adminHeaders)
        .send({
          drug_id: testDrugId,
          vendor_id: testVendorId,
          indent_item_ids: [testIndentItemId1],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("not in 'approved' status");
    });

    it("should return 400 when an indent item has a drug mismatch", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: testVendorId, name: "Pharma Co", active: true }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: testIndentItemId1,
              drug_id: otherDrugId, // Mismatch!
              quantity_approved: 500,
              status: "approved",
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .post("/api/v1/supply-orders/aggregate")
        .set(adminHeaders)
        .send({
          drug_id: testDrugId,
          vendor_id: testVendorId,
          indent_item_ids: [testIndentItemId1],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("drug mismatch");
    });

    it("should return 400 when an indent item has already been fulfilled", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: testVendorId, name: "Pharma Co", active: true }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: testIndentItemId1,
              drug_id: testDrugId,
              quantity_approved: 500,
              status: "approved",
            },
          ],
        })
        .mockResolvedValueOnce({
          // SELECT indent_item_fulfillment -> already exists!
          rows: [{ indent_item_id: testIndentItemId1 }],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .post("/api/v1/supply-orders/aggregate")
        .set(adminHeaders)
        .send({
          drug_id: testDrugId,
          vendor_id: testVendorId,
          indent_item_ids: [testIndentItemId1],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("already been fulfilled");
    });

    it("should aggregate items and create supply order successfully (201)", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT vendors
          rows: [{ id: testVendorId, name: "Pharma Co", active: true }],
        })
        .mockResolvedValueOnce({
          // SELECT indent_items
          rows: [
            {
              id: testIndentItemId1,
              drug_id: testDrugId,
              quantity_approved: 300,
              status: "approved",
            },
            {
              id: testIndentItemId2,
              drug_id: testDrugId,
              quantity_approved: 200,
              status: "approved",
            },
          ],
        })
        .mockResolvedValueOnce({
          // SELECT existing fulfillment (empty)
          rows: [],
        })
        .mockResolvedValueOnce({
          // INSERT supply_orders
          rows: [
            {
              id: testSupplyOrderId,
              vendor_id: testVendorId,
              status: "created",
              created_by: testUserId,
            },
          ],
        })
        .mockResolvedValueOnce({
          // INSERT supply_order_items (sum: 500)
          rows: [
            {
              id: "item-1234",
              supply_order_id: testSupplyOrderId,
              drug_id: testDrugId,
              quantity: 500,
            },
          ],
        })
        .mockResolvedValueOnce({
          // INSERT indent_item_fulfillment 1
          rows: [{ indent_item_id: testIndentItemId1, quantity_allocated: 300 }],
        })
        .mockResolvedValueOnce({
          // INSERT indent_item_fulfillment 2
          rows: [{ indent_item_id: testIndentItemId2, quantity_allocated: 200 }],
        })
        .mockResolvedValueOnce({}) // UPDATE indent_items to fulfilled
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/v1/supply-orders/aggregate")
        .set(governmentHeaders)
        .send({
          drug_id: testDrugId,
          vendor_id: testVendorId,
          indent_item_ids: [testIndentItemId1, testIndentItemId2],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.supply_order.id).toBe(testSupplyOrderId);
      expect(res.body.data.supply_order_item.quantity).toBe(500);
      expect(res.body.data.fulfillment).toHaveLength(2);
      expect(clientMock.release).toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/supply-orders", () => {
    it("should return paginated supply orders", async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({
        rows: [
          {
            id: testSupplyOrderId,
            vendor_id: testVendorId,
            vendor_name: "Apex Pharma",
            status: "created",
            item_count: 1,
            total_quantity: 500,
          },
        ],
      });

      const res = await request(app)
        .get("/api/v1/supply-orders?page=1&limit=20")
        .set(hospitalHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
    });
  });

  describe("GET /api/v1/supply-orders/:id", () => {
    it("should return 404 when supply order not found", async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/api/v1/supply-orders/${testSupplyOrderId}`)
        .set(adminHeaders);

      expect(res.status).toBe(404);
    });

    it("should return supply order with items when found (200)", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testSupplyOrderId,
              vendor_id: testVendorId,
              status: "created",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "item-1234",
              supply_order_id: testSupplyOrderId,
              drug_id: testDrugId,
              quantity: 500,
            },
          ],
        });

      const res = await request(app)
        .get(`/api/v1/supply-orders/${testSupplyOrderId}`)
        .set(adminHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testSupplyOrderId);
      expect(res.body.data.items).toHaveLength(1);
    });
  });

  describe("PATCH /api/v1/supply-orders/:id/status", () => {
    it("should return 403 when vendor_staff modifies order for another facility", async () => {
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
              vendor_id: testVendorId,
              vendor_facility_id: otherFacilityId, // Not testFacilityId!
              status: "created",
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .patch(`/api/v1/supply-orders/${testSupplyOrderId}/status`)
        .set(vendorHeaders)
        .send({ status: "confirmed" });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("not authorized");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should return 409 when invalid transition attempted (e.g. from cancelled)", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT FOR UPDATE -> already cancelled
          rows: [{ id: testSupplyOrderId, status: "cancelled" }],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .patch(`/api/v1/supply-orders/${testSupplyOrderId}/status`)
        .set(adminHeaders)
        .send({ status: "confirmed" });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("Invalid status transition");
    });

    it("should update supply order status to confirmed successfully (200)", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT FOR UPDATE -> created
          rows: [{ id: testSupplyOrderId, status: "created" }],
        })
        .mockResolvedValueOnce({
          // UPDATE
          rows: [{ id: testSupplyOrderId, status: "confirmed" }],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .patch(`/api/v1/supply-orders/${testSupplyOrderId}/status`)
        .set(adminHeaders)
        .send({ status: "confirmed" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("confirmed");
    });
  });
});
