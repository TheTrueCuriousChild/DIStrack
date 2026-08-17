import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_FACILITY_ID = "00000000-0000-4000-8000-000000000099";
const BATCH_ID = "00000000-0000-4000-8000-000000000004";
const DRUG_ID = "00000000-0000-4000-8000-000000000003";

describe("Stock and Ledger API", () => {
  it("rejects unauthorized facility stock read with 403", async () => {
    const response = await request(app)
      .get(`/api/v1/facilities/${OTHER_FACILITY_ID}/stock`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(403);
  });

  it("returns facility stock summary for authorized facility", async () => {
    const mockStock = [
      {
        batch_id: BATCH_ID,
        drug_id: DRUG_ID,
        drug_name: "Paracetamol",
        batch_no: "B2026-0142",
        expiry_date: "2027-01-10",
        quantity_on_hand: 340,
      },
    ];

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: mockStock });

    const response = await request(app)
      .get(`/api/v1/facilities/${VALID_FACILITY_ID}/stock`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(mockStock);
  });

  it("filters low stock when low_stock_only=true", async () => {
    const mockStock = [
      {
        batch_id: BATCH_ID,
        drug_id: DRUG_ID,
        drug_name: "Paracetamol",
        batch_no: "B2026-0142",
        expiry_date: "2027-01-10",
        quantity_on_hand: 12,
      },
    ];

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: mockStock });

    const response = await request(app)
      .get(`/api/v1/facilities/${VALID_FACILITY_ID}/stock?low_stock_only=true`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(mockStock);
  });

  it("returns paginated raw stock ledger", async () => {
    const mockLedger = [
      {
        id: "ledger-1",
        facility_id: VALID_FACILITY_ID,
        batch_id: BATCH_ID,
        quantity: 100,
        txn_type: "receipt",
        reference_type: "receipt",
        created_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (typeof sql === "string" && sql.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return { rows: mockLedger };
    });

    const response = await request(app)
      .get(
        `/api/v1/facilities/${VALID_FACILITY_ID}/ledger?txn_type=receipt&page=1&limit=20`
      )
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.data).toEqual(mockLedger);
    expect(response.body.data.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it("throws and propagates database errors when refreshStockSummary fails", async () => {
    const { refreshStockSummary } =
      await import("../src/models/stock.model.js");
    const mockClient = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("Materialized view refresh failed")),
    };

    await expect(refreshStockSummary(mockClient)).rejects.toThrow(
      "Materialized view refresh failed"
    );
  });
});
