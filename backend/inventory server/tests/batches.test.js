import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";
const DRUG_ID = "00000000-0000-4000-8000-000000000003";
const BATCH_ID = "00000000-0000-4000-8000-000000000004";

describe("Batches API", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const response = await request(app).get("/api/v1/batches");
    expect(response.status).toBe(401);
  });

  it("allows warehouse_staff to create a batch", async () => {
    const createdBatch = {
      id: BATCH_ID,
      drug_id: DRUG_ID,
      batch_no: "BATCH-2026-001",
      manufacturer: "Pharma Corp",
      manufacturing_date: "2026-01-01",
      expiry_date: "2027-01-01",
      qr_code: "batch:some-qr-uuid",
      created_at: new Date().toISOString(),
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [createdBatch] });

    const response = await request(app)
      .post("/api/v1/batches")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "warehouse_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        drug_id: DRUG_ID,
        batch_no: "BATCH-2026-001",
        manufacturer: "Pharma Corp",
        manufacturing_date: "2026-01-01",
        expiry_date: "2027-01-01",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.batch_no).toBe("BATCH-2026-001");
  });

  it("returns 409 for duplicate batch_no for same drug", async () => {
    const pgError = new Error("duplicate key value");
    pgError.code = "23505";
    vi.spyOn(pool, "query").mockRejectedValueOnce(pgError);

    const response = await request(app)
      .post("/api/v1/batches")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "admin")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        drug_id: DRUG_ID,
        batch_no: "BATCH-2026-001",
        expiry_date: "2027-01-01",
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already exists/i);
  });

  it("lists batches with filters and pagination", async () => {
    const mockBatches = [
      {
        id: BATCH_ID,
        drug_id: DRUG_ID,
        drug_name: "Paracetamol",
        batch_no: "BATCH-2026-001",
        expiry_date: "2027-01-01",
        qr_code: "batch:qr-1",
      },
    ];

    vi.spyOn(pool, "query").mockImplementation(async (query) => {
      if (typeof query === "string" && query.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return { rows: mockBatches };
    });

    const response = await request(app)
      .get(`/api/v1/batches?drug_id=${DRUG_ID}&page=1&limit=20`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.data).toEqual(mockBatches);
    expect(response.body.data.meta.total).toBe(1);
  });

  it("gets batch by UUID", async () => {
    const mockBatch = {
      id: BATCH_ID,
      drug_id: DRUG_ID,
      drug_name: "Paracetamol",
      batch_no: "BATCH-2026-001",
      expiry_date: "2027-01-01",
      qr_code: "batch:qr-1",
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [mockBatch] });

    const response = await request(app)
      .get(`/api/v1/batches/${BATCH_ID}`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(BATCH_ID);
  });

  it("gets batch by QR code", async () => {
    const mockBatch = {
      id: BATCH_ID,
      drug_id: DRUG_ID,
      drug_name: "Paracetamol",
      batch_no: "BATCH-2026-001",
      expiry_date: "2027-01-01",
      qr_code: "batch:qr-custom-code",
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [mockBatch] });

    const response = await request(app)
      .get("/api/v1/batches/batch:qr-custom-code")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.qr_code).toBe("batch:qr-custom-code");
  });

  it("renders QR image on demand as image/png", async () => {
    const mockBatch = {
      id: BATCH_ID,
      qr_code: "batch:qr-test",
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [mockBatch] });

    const response = await request(app)
      .get(`/api/v1/batches/${BATCH_ID}/qr-image`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.body).toBeInstanceOf(Buffer);
  });
});
