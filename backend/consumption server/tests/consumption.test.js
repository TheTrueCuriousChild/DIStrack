import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_FACILITY_ID = "00000000-0000-4000-8000-000000000099";
const CHILD_FACILITY_ID = "00000000-0000-4000-8000-000000000003";
const BATCH_ID = "00000000-0000-4000-8000-000000000004";
const DRUG_ID = "00000000-0000-4000-8000-000000000005";
const OTHER_DRUG_ID = "00000000-0000-4000-8000-000000000006";
const CONSUMPTION_ID = "00000000-0000-4000-8000-000000000010";

describe("Consumption API", () => {
  describe("POST /api/v1/consumption", () => {
    it("records consumption atomically and appends negative ledger movement", async () => {
      const mockConsumption = {
        id: CONSUMPTION_ID,
        facility_id: VALID_FACILITY_ID,
        batch_id: BATCH_ID,
        drug_id: DRUG_ID,
        quantity: 25,
        recorded_by: VALID_USER_ID,
        consumed_at: new Date().toISOString(),
      };

      const mockClient = {
        query: vi.fn(async (sql) => {
          if (typeof sql === "string") {
            if (sql.includes("BEGIN") || sql.includes("COMMIT")) return {};
            if (
              sql.includes(
                "SELECT id, drug_id FROM batches WHERE id = $1 FOR UPDATE"
              )
            ) {
              return {
                rowCount: 1,
                rows: [{ id: BATCH_ID, drug_id: DRUG_ID }],
              };
            }
            if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
              return { rows: [{ available_stock: 100 }] }; // 100 available >= 25 requested
            }
            if (sql.includes("INSERT INTO consumption")) {
              return { rows: [mockConsumption] };
            }
            if (sql.includes("INSERT INTO stock_ledger")) {
              return { rows: [{ id: "ledger-entry-1" }] };
            }
            if (sql.includes("REFRESH MATERIALIZED VIEW")) {
              return {};
            }
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

      const response = await request(app)
        .post("/api/v1/consumption")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID)
        .send({
          facility_id: VALID_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: 25,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(CONSUMPTION_ID);
      expect(response.body.data.quantity).toBe(25);

      // Verify batch row lock FOR UPDATE was executed
      const lockCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("FROM batches WHERE id = $1 FOR UPDATE")
      );
      expect(lockCall).toBeDefined();

      // Verify negative stock ledger insert was made (-25)
      const ledgerCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("INSERT INTO stock_ledger")
      );
      expect(ledgerCall).toBeDefined();
      expect(ledgerCall[0]).toContain("'consumption'");
      expect(ledgerCall[1][0]).toBe(VALID_FACILITY_ID);
      expect(ledgerCall[1][1]).toBe(BATCH_ID);
      expect(ledgerCall[1][2]).toBe(-25); // quantity is negative
      expect(ledgerCall[1][3]).toBe(CONSUMPTION_ID); // reference_id
      expect(ledgerCall[1][4]).toBe(VALID_USER_ID); // actor_user_id

      // Verify stock_summary materialized view was refreshed
      const refreshCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("REFRESH MATERIALIZED VIEW stock_summary")
      );
      expect(refreshCall).toBeDefined();
    });

    it("rejects consumption with 400 on invalid payload or non-positive quantity", async () => {
      const response = await request(app)
        .post("/api/v1/consumption")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID)
        .send({
          facility_id: VALID_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: -5, // Invalid negative quantity
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("rejects consumption with 404 when batch does not exist", async () => {
      const mockClient = {
        query: vi.fn(async (sql) => {
          if (typeof sql === "string") {
            if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) return {};
            if (sql.includes("SELECT id, drug_id FROM batches")) {
              return { rowCount: 0, rows: [] };
            }
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

      const response = await request(app)
        .post("/api/v1/consumption")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID)
        .send({
          facility_id: VALID_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: 10,
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/batch not found/i);
    });

    it("rejects consumption with 400 when batch drug_id does not match payload drug_id", async () => {
      const mockClient = {
        query: vi.fn(async (sql) => {
          if (typeof sql === "string") {
            if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) return {};
            if (sql.includes("SELECT id, drug_id FROM batches")) {
              return {
                rowCount: 1,
                rows: [{ id: BATCH_ID, drug_id: OTHER_DRUG_ID }],
              };
            }
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

      const response = await request(app)
        .post("/api/v1/consumption")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID)
        .send({
          facility_id: VALID_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: 10,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/drug id does not match/i);
    });

    it("rejects consumption with 409 when available stock is insufficient", async () => {
      const mockClient = {
        query: vi.fn(async (sql) => {
          if (typeof sql === "string") {
            if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) return {};
            if (sql.includes("SELECT id, drug_id FROM batches")) {
              return {
                rowCount: 1,
                rows: [{ id: BATCH_ID, drug_id: DRUG_ID }],
              };
            }
            if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
              return { rows: [{ available_stock: 5 }] }; // 5 available < 20 requested
            }
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

      const response = await request(app)
        .post("/api/v1/consumption")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID)
        .send({
          facility_id: VALID_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: 20,
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/insufficient stock/i);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("rejects consumption with 403 when hospital_staff targets unauthorized facility", async () => {
      const response = await request(app)
        .post("/api/v1/consumption")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID)
        .send({
          facility_id: OTHER_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: 5,
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/access/i);
    });

    it("allows warehouse_staff to record consumption for permitted child facility", async () => {
      const mockConsumption = {
        id: CONSUMPTION_ID,
        facility_id: CHILD_FACILITY_ID,
        batch_id: BATCH_ID,
        drug_id: DRUG_ID,
        quantity: 10,
        recorded_by: VALID_USER_ID,
      };

      vi.spyOn(pool, "query").mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("parent_facility_id")) {
          return { rowCount: 1, rows: [{ 1: 1 }] };
        }
        return { rows: [] };
      });

      const mockClient = {
        query: vi.fn(async (sql) => {
          if (typeof sql === "string") {
            if (sql.includes("BEGIN") || sql.includes("COMMIT")) return {};
            if (sql.includes("SELECT id, drug_id FROM batches")) {
              return {
                rowCount: 1,
                rows: [{ id: BATCH_ID, drug_id: DRUG_ID }],
              };
            }
            if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
              return { rows: [{ available_stock: 50 }] };
            }
            if (sql.includes("INSERT INTO consumption")) {
              return { rows: [mockConsumption] };
            }
            if (sql.includes("INSERT INTO stock_ledger")) {
              return { rows: [{ id: "ledger-entry-1" }] };
            }
            if (sql.includes("REFRESH MATERIALIZED VIEW")) {
              return {};
            }
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

      const response = await request(app)
        .post("/api/v1/consumption")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "warehouse_staff")
        .set("x-facility-id", VALID_FACILITY_ID)
        .send({
          facility_id: CHILD_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: 10,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.id).toBe(CONSUMPTION_ID);
    });

    it("rolls back transaction and returns 500 if stock_summary refresh fails", async () => {
      const mockClient = {
        query: vi.fn(async (sql) => {
          if (typeof sql === "string") {
            if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) return {};
            if (sql.includes("SELECT id, drug_id FROM batches")) {
              return {
                rowCount: 1,
                rows: [{ id: BATCH_ID, drug_id: DRUG_ID }],
              };
            }
            if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
              return { rows: [{ available_stock: 50 }] };
            }
            if (sql.includes("INSERT INTO consumption")) {
              return { rows: [{ id: CONSUMPTION_ID }] };
            }
            if (sql.includes("INSERT INTO stock_ledger")) {
              return { rows: [{ id: "ledger-1" }] };
            }
            if (sql.includes("REFRESH MATERIALIZED VIEW")) {
              throw new Error(
                "Materialized view refresh failed due to deadlock"
              );
            }
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

      const response = await request(app)
        .post("/api/v1/consumption")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID)
        .send({
          facility_id: VALID_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: 10,
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("GET /api/v1/consumption", () => {
    it("returns paginated consumption records with filters", async () => {
      const mockList = [
        {
          id: CONSUMPTION_ID,
          facility_id: VALID_FACILITY_ID,
          batch_id: BATCH_ID,
          drug_id: DRUG_ID,
          quantity: 25,
          recorded_by: VALID_USER_ID,
          consumed_at: new Date().toISOString(),
          drug_name: "Amoxicillin",
          drug_unit: "capsule",
          batch_no: "B-2026-AMOX",
          expiry_date: "2027-06-30",
        },
      ];

      vi.spyOn(pool, "query").mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("COUNT(*)")) {
          return { rows: [{ total: 1 }] };
        }
        return { rows: mockList };
      });

      const response = await request(app)
        .get(
          `/api/v1/consumption?facility_id=${VALID_FACILITY_ID}&drug_id=${DRUG_ID}&page=1&limit=20`
        )
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID);

      expect(response.status).toBe(200);
      expect(response.body.data.data).toEqual(mockList);
      expect(response.body.data.meta).toEqual({ page: 1, limit: 20, total: 1 });
    });

    it("rejects hospital_staff listing records for another facility with 403", async () => {
      const response = await request(app)
        .get(`/api/v1/consumption?facility_id=${OTHER_FACILITY_ID}`)
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID);

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/v1/consumption/:id", () => {
    it("returns consumption record by ID with 200", async () => {
      const mockRecord = {
        id: CONSUMPTION_ID,
        facility_id: VALID_FACILITY_ID,
        batch_id: BATCH_ID,
        drug_id: DRUG_ID,
        quantity: 25,
        recorded_by: VALID_USER_ID,
        consumed_at: new Date().toISOString(),
        drug_name: "Amoxicillin",
        drug_unit: "capsule",
        batch_no: "B-2026-AMOX",
        expiry_date: "2027-06-30",
      };

      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [mockRecord] });

      const response = await request(app)
        .get(`/api/v1/consumption/${CONSUMPTION_ID}`)
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockRecord);
    });

    it("returns 404 when consumption record is not found", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/api/v1/consumption/${CONSUMPTION_ID}`)
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID);

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found/i);
    });

    it("rejects invalid UUID parameter with 400", async () => {
      const response = await request(app)
        .get("/api/v1/consumption/not-a-valid-uuid")
        .set("x-user-id", VALID_USER_ID)
        .set("x-user-role", "hospital_staff")
        .set("x-facility-id", VALID_FACILITY_ID);

      expect(response.status).toBe(400);
    });
  });
});
