import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";
const BATCH_ID = "00000000-0000-4000-8000-000000000004";
const WASTAGE_ID = "00000000-0000-4000-8000-000000000030";

describe("Wastage API", () => {
  it("creates wastage record atomically and writes negative ledger entry", async () => {
    const mockWastage = {
      id: WASTAGE_ID,
      facility_id: VALID_FACILITY_ID,
      batch_id: BATCH_ID,
      quantity: 15,
      reason: "expired",
      reported_by: VALID_USER_ID,
      created_at: new Date().toISOString(),
    };

    const mockClient = {
      query: vi.fn(async (sql) => {
        if (typeof sql === "string") {
          if (sql.includes("BEGIN") || sql.includes("COMMIT")) return {};
          if (sql.includes("SELECT id FROM batches")) {
            return { rowCount: 1, rows: [{ id: BATCH_ID }] };
          }
          if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
            return { rows: [{ available_stock: 50 }] }; // 50 available >= 15
          }
          if (sql.includes("INSERT INTO wastage")) {
            return { rows: [mockWastage] };
          }
          if (sql.includes("INSERT INTO stock_ledger")) {
            return { rows: [{ id: "ledger-wastage-1" }] };
          }
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

    const response = await request(app)
      .post("/api/v1/wastage")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        facility_id: VALID_FACILITY_ID,
        batch_id: BATCH_ID,
        quantity: 15,
        reason: "expired",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(WASTAGE_ID);

    // Verify negative stock ledger insert was made (-15)
    const ledgerCall = mockClient.query.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("INSERT INTO stock_ledger")
    );
    expect(ledgerCall).toBeDefined();
    expect(ledgerCall[1][2]).toBe(-15);
  });

  it("rejects wastage with 409 when available stock is insufficient", async () => {
    const mockClient = {
      query: vi.fn(async (sql) => {
        if (typeof sql === "string") {
          if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) return {};
          if (sql.includes("SELECT id FROM batches")) {
            return { rowCount: 1, rows: [{ id: BATCH_ID }] };
          }
          if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
            return { rows: [{ available_stock: 5 }] }; // 5 available < 15
          }
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

    const response = await request(app)
      .post("/api/v1/wastage")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        facility_id: VALID_FACILITY_ID,
        batch_id: BATCH_ID,
        quantity: 15,
        reason: "damaged",
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/insufficient stock/i);
  });

  it("lists wastage records with pagination and filters", async () => {
    const mockWastageList = [
      {
        id: WASTAGE_ID,
        facility_id: VALID_FACILITY_ID,
        batch_id: BATCH_ID,
        batch_no: "B2026-1",
        drug_name: "Paracetamol",
        quantity: 15,
        reason: "expired",
      },
    ];

    vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (typeof sql === "string" && sql.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return { rows: mockWastageList };
    });

    const response = await request(app)
      .get(`/api/v1/wastage?facility_id=${VALID_FACILITY_ID}&page=1&limit=20`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.data).toEqual(mockWastageList);
    expect(response.body.data.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it("rolls back transaction and returns 500 when refreshStockSummary fails during wastage mutation", async () => {
    const mockClient = {
      query: vi.fn(async (sql) => {
        if (typeof sql === "string") {
          if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) return {};
          if (sql.includes("SELECT id FROM batches")) {
            return { rowCount: 1, rows: [{ id: BATCH_ID }] };
          }
          if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
            return { rows: [{ available_stock: 50 }] };
          }
          if (sql.includes("INSERT INTO wastage")) {
            return { rows: [{ id: WASTAGE_ID }] };
          }
          if (sql.includes("INSERT INTO stock_ledger")) {
            return { rows: [{ id: "ledger-wastage-1" }] };
          }
          if (sql.includes("REFRESH MATERIALIZED VIEW")) {
            throw new Error("Materialized view refresh failed due to deadlock");
          }
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

    const response = await request(app)
      .post("/api/v1/wastage")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        facility_id: VALID_FACILITY_ID,
        batch_id: BATCH_ID,
        quantity: 15,
        reason: "expired",
      });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
