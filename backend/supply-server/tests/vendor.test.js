import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

vi.mock("../src/db/index.js", () => {
  const queryMock = vi.fn();
  const connectMock = vi.fn();
  return {
    pool: {
      query: queryMock,
      connect: connectMock,
    },
  };
});

describe("Vendor Endpoints (/api/v1/vendors)", () => {
  const testUserId = "11111111-1111-4111-8111-111111111111";
  const testFacilityId = "22222222-2222-4222-8222-222222222222";
  const testVendorId = "33333333-3333-4333-8333-333333333333";

  const adminHeaders = {
    "x-user-id": testUserId,
    "x-user-role": "admin",
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

  describe("Authentication", () => {
    it("should return 401 when identity headers are missing", async () => {
      const res = await request(app).get("/api/v1/vendors");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/v1/vendors", () => {
    it("should return paginated list of vendors", async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({
        rows: [
          {
            id: testVendorId,
            name: "Apex Pharma",
            contact: "+91-9876543210",
            email: "contact@apexpharma.com",
            active: true,
          },
        ],
      });

      const res = await request(app)
        .get("/api/v1/vendors?active=true&page=1&limit=10")
        .set(hospitalHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.meta).toEqual({ page: 1, limit: 10, total: 1 });
    });
  });

  describe("POST /api/v1/vendors", () => {
    it("should return 403 when non-admin user creates a vendor", async () => {
      const res = await request(app)
        .post("/api/v1/vendors")
        .set(hospitalHeaders)
        .send({ name: "Unauthorized Pharma" });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("You are not allowed to perform this action");
    });

    it("should return 400 when vendor name is missing", async () => {
      const res = await request(app)
        .post("/api/v1/vendors")
        .set(adminHeaders)
        .send({ contact: "12345" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
    });

    it("should create vendor successfully when called by admin (201)", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: testVendorId,
            name: "Cipla Biotech",
            contact: "info@cipla.com",
            email: "info@cipla.com",
            active: true,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app).post("/api/v1/vendors").set(adminHeaders).send({
        name: "Cipla Biotech",
        contact: "info@cipla.com",
        email: "info@cipla.com",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Cipla Biotech");
    });
  });

  describe("GET /api/v1/vendors/:id", () => {
    it("should return 404 when vendor not found", async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/api/v1/vendors/${testVendorId}`).set(hospitalHeaders);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain("not found");
    });

    it("should return vendor details when found (200)", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: testVendorId,
            name: "Sun Pharma",
            active: true,
          },
        ],
      });

      const res = await request(app).get(`/api/v1/vendors/${testVendorId}`).set(hospitalHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Sun Pharma");
    });
  });

  describe("PATCH /api/v1/vendors/:id", () => {
    it("should return 400 when update body is empty", async () => {
      const res = await request(app)
        .patch(`/api/v1/vendors/${testVendorId}`)
        .set(adminHeaders)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
    });

    it("should return 404 when updating non-existent vendor", async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .patch(`/api/v1/vendors/${testVendorId}`)
        .set(adminHeaders)
        .send({ name: "Updated Pharma" });

      expect(res.status).toBe(404);
    });

    it("should update vendor successfully (200)", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ id: testVendorId, name: "Old Name", active: true }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: testVendorId, name: "New Name", active: false }],
        });

      const res = await request(app)
        .patch(`/api/v1/vendors/${testVendorId}`)
        .set(adminHeaders)
        .send({ name: "New Name", active: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("New Name");
      expect(res.body.data.active).toBe(false);
    });
  });
});
