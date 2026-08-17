import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

// Mock the pg pool
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

describe("Indent Endpoints (/api/v1/indents)", () => {
  const testUserId = "11111111-1111-4111-8111-111111111111";
  const testFacilityId = "22222222-2222-4222-8222-222222222222";
  const otherFacilityId = "33333333-3333-4333-8333-333333333333";
  const testDrugId1 = "44444444-4444-4444-8444-444444444444";
  const testDrugId2 = "55555555-5555-4555-8555-555555555555";
  const testIndentId = "66666666-6666-4666-8666-666666666666";
  const testItemId1 = "77777777-7777-4777-8777-777777777777";
  const testItemId2 = "88888888-8888-4888-8888-888888888888";

  const hospitalHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "hospital_staff",
    "x-facility-id": testFacilityId,
  };

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication & Authorization Middleware", () => {
    it("should return 401 when identity headers are missing", async () => {
      const res = await request(app).get("/api/v1/indents");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Missing or invalid identity context");
    });

    it("should return 401 when user role is invalid", async () => {
      const res = await request(app).get("/api/v1/indents").set({
        "x-user-id": testUserId,
        "x-user-role": "superman",
        "x-facility-id": testFacilityId,
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 403 when vendor_staff attempts to create an indent", async () => {
      const res = await request(app)
        .post("/api/v1/indents")
        .set(vendorHeaders)
        .send({
          requesting_facility_id: testFacilityId,
          items: [{ drug_id: testDrugId1, quantity_requested: 100 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("You are not allowed to perform this action");
    });
  });

  describe("POST /api/v1/indents", () => {
    it("should return 400 when validation fails (empty items array)", async () => {
      const res = await request(app).post("/api/v1/indents").set(hospitalHeaders).send({
        requesting_facility_id: testFacilityId,
        items: [],
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation failed");
    });

    it("should return 400 when duplicate drug_id exists in items array", async () => {
      const res = await request(app)
        .post("/api/v1/indents")
        .set(hospitalHeaders)
        .send({
          requesting_facility_id: testFacilityId,
          items: [
            { drug_id: testDrugId1, quantity_requested: 50 },
            { drug_id: testDrugId1, quantity_requested: 100 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation failed");
      expect(JSON.stringify(res.body.errors)).toContain("Duplicate drug_id");
    });

    it("should return 403 when hospital_staff creates indent for a different facility", async () => {
      const res = await request(app)
        .post("/api/v1/indents")
        .set(hospitalHeaders)
        .send({
          requesting_facility_id: otherFacilityId,
          items: [{ drug_id: testDrugId1, quantity_requested: 100 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain(
        "Hospital staff can only create indents for their assigned facility"
      );
    });

    it("should create an indent successfully on happy path (201)", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      // Begin transaction
      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // Insert indent
          rows: [
            {
              id: testIndentId,
              requesting_facility_id: testFacilityId,
              priority: "urgent",
              status: "submitted",
              created_by: testUserId,
              created_at: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({
          // Insert item 1
          rows: [
            {
              id: testItemId1,
              indent_id: testIndentId,
              drug_id: testDrugId1,
              quantity_requested: 200,
              status: "pending",
            },
          ],
        })
        .mockResolvedValueOnce({
          // Insert item 2
          rows: [
            {
              id: testItemId2,
              indent_id: testIndentId,
              drug_id: testDrugId2,
              quantity_requested: 300,
              status: "pending",
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/v1/indents")
        .set(hospitalHeaders)
        .send({
          requesting_facility_id: testFacilityId,
          priority: "urgent",
          items: [
            { drug_id: testDrugId1, quantity_requested: 200 },
            { drug_id: testDrugId2, quantity_requested: 300 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.indent.id).toBe(testIndentId);
      expect(res.body.data.items).toHaveLength(2);
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should handle foreign key violation for invalid drug_id with 400", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      const fkError = new Error(
        'insert or update on table "indent_items" violates foreign key constraint'
      );
      fkError.code = "23503";
      fkError.constraint = "indent_items_drug_id_fkey";

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: testIndentId, requesting_facility_id: testFacilityId, status: "submitted" }],
        })
        .mockRejectedValueOnce(fkError) // Insert item fails with FK violation
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .post("/api/v1/indents")
        .set(hospitalHeaders)
        .send({
          requesting_facility_id: testFacilityId,
          items: [{ drug_id: testDrugId1, quantity_requested: 100 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("do not exist in the drugs catalog");
      expect(clientMock.release).toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/indents", () => {
    it("should return paginated list of indents for hospital_staff scoped to facility", async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // Count query
        .mockResolvedValueOnce({
          // List query
          rows: [
            {
              id: testIndentId,
              requesting_facility_id: testFacilityId,
              priority: "normal",
              status: "submitted",
              item_count: 2,
              created_at: new Date().toISOString(),
            },
          ],
        });

      const res = await request(app).get("/api/v1/indents?page=1&limit=10").set(hospitalHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].item_count).toBe(2);
      expect(res.body.data.meta).toEqual({ page: 1, limit: 10, total: 1 });

      // Verify that facilityId was used in the query params
      expect(pool.query.mock.calls[0][1]).toContain(testFacilityId);
    });

    it("should return unscoped list of indents for admin", async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [{ id: testIndentId, item_count: 1 }] });

      const res = await request(app).get("/api/v1/indents").set(adminHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Query parameters for admin should not enforce requesting_facility_id
      expect(pool.query.mock.calls[0][1]).not.toContain(testFacilityId);
    });
  });

  describe("GET /api/v1/indents/:id", () => {
    it("should return 404 when indent does not exist", async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/api/v1/indents/${testIndentId}`).set(adminHeaders);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("not found");
    });

    it("should return 403 when hospital_staff requests indent from another facility", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testIndentId,
              requesting_facility_id: otherFacilityId,
              status: "submitted",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/api/v1/indents/${testIndentId}`).set(hospitalHeaders);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("not authorized");
    });

    it("should return indent and items on success (200)", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testIndentId,
              requesting_facility_id: testFacilityId,
              status: "submitted",
              priority: "normal",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: testItemId1,
              indent_id: testIndentId,
              drug_id: testDrugId1,
              quantity_requested: 500,
              drug_name: "Amoxicillin",
            },
          ],
        });

      const res = await request(app).get(`/api/v1/indents/${testIndentId}`).set(hospitalHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testIndentId);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].drug_name).toBe("Amoxicillin");
    });
  });

  describe("GET /api/v1/indents/:id/items", () => {
    it("should return only items array for an indent", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: testIndentId,
              requesting_facility_id: testFacilityId,
              status: "submitted",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: testItemId1,
              indent_id: testIndentId,
              drug_id: testDrugId1,
              quantity_requested: 500,
            },
          ],
        });

      const res = await request(app)
        .get(`/api/v1/indents/${testIndentId}/items`)
        .set(hospitalHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].id).toBe(testItemId1);
    });
  });

  describe("PATCH /api/v1/indents/:id/approve", () => {
    it("should return 403 when hospital_staff attempts to approve an indent", async () => {
      const res = await request(app)
        .patch(`/api/v1/indents/${testIndentId}/approve`)
        .set(hospitalHeaders)
        .send({});

      expect(res.status).toBe(403);
    });

    it("should return 409 when approving an already-approved indent", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT indents FOR UPDATE
          rows: [
            {
              id: testIndentId,
              status: "approved",
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .patch(`/api/v1/indents/${testIndentId}/approve`)
        .set(adminHeaders)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Only 'submitted' indents can be approved");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should return 400 when quantity_approved exceeds quantity_requested", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT indents FOR UPDATE
          rows: [{ id: testIndentId, status: "submitted" }],
        })
        .mockResolvedValueOnce({
          // SELECT indent_items FOR UPDATE
          rows: [
            {
              id: testItemId1,
              quantity_requested: 100,
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .patch(`/api/v1/indents/${testIndentId}/approve`)
        .set(adminHeaders)
        .send({
          items: [{ id: testItemId1, quantity_approved: 150 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("cannot exceed requested quantity");
      expect(clientMock.release).toHaveBeenCalled();
    });

    it("should approve indent and items successfully (200)", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // SELECT indents FOR UPDATE
          rows: [{ id: testIndentId, status: "submitted" }],
        })
        .mockResolvedValueOnce({
          // SELECT indent_items FOR UPDATE
          rows: [
            {
              id: testItemId1,
              quantity_requested: 200,
            },
          ],
        })
        .mockResolvedValueOnce({
          // UPDATE indents
          rows: [
            {
              id: testIndentId,
              status: "approved",
              approved_by: testUserId,
            },
          ],
        })
        .mockResolvedValueOnce({
          // UPDATE indent_items
          rows: [
            {
              id: testItemId1,
              status: "approved",
              quantity_approved: 180,
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .patch(`/api/v1/indents/${testIndentId}/approve`)
        .set(adminHeaders)
        .send({
          items: [{ id: testItemId1, quantity_approved: 180 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.indent.status).toBe("approved");
      expect(res.body.data.items[0].quantity_approved).toBe(180);
      expect(clientMock.release).toHaveBeenCalled();
    });
  });

  describe("PATCH /api/v1/indents/:id/reject", () => {
    it("should return 409 when rejecting a non-submitted indent", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: testIndentId, status: "approved" }],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .patch(`/api/v1/indents/${testIndentId}/reject`)
        .set(adminHeaders)
        .send({ reason: "Duplicate request" });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("Only 'submitted' indents can be rejected");
    });

    it("should reject submitted indent successfully (200)", async () => {
      const clientMock = {
        query: vi.fn(),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValueOnce(clientMock);

      clientMock.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: testIndentId, status: "submitted" }],
        })
        .mockResolvedValueOnce({
          // UPDATE indents
          rows: [{ id: testIndentId, status: "rejected" }],
        })
        .mockResolvedValueOnce({}) // UPDATE indent_items
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .patch(`/api/v1/indents/${testIndentId}/reject`)
        .set(adminHeaders)
        .send({ reason: "Not justified by consumption history" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("rejected");
    });
  });
});
