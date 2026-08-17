import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_FACILITY_ID = "00000000-0000-4000-8000-000000000099";
const SHIPMENT_ID = "00000000-0000-4000-8000-000000000005";
const DRUG_ID = "00000000-0000-4000-8000-000000000003";
const BATCH_ID = "00000000-0000-4000-8000-000000000004";
const RECEIPT_ID = "00000000-0000-4000-8000-000000000006";

describe("Receipts API", () => {
  it("rejects receipt creation for unauthorized facility access with 403", async () => {
    const response = await request(app)
      .post("/api/v1/receipts")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        shipment_id: SHIPMENT_ID,
        receiving_facility_id: OTHER_FACILITY_ID,
        items: [
          {
            drug_id: DRUG_ID,
            batch_id: BATCH_ID,
            quantity_received: 100,
            quantity_damaged: 0,
          },
        ],
      });

    expect(response.status).toBe(403);
  });

  it("creates receipt atomically and records net stock ledger entry", async () => {
    const mockClient = {
      query: vi.fn(async (sql) => {
        if (typeof sql === "string") {
          if (sql.includes("BEGIN") || sql.includes("COMMIT")) {
            return {};
          }
          if (sql.includes("SELECT id FROM shipments")) {
            return { rowCount: 1, rows: [{ id: SHIPMENT_ID }] };
          }
          if (sql.includes("INSERT INTO receipts")) {
            return {
              rows: [
                {
                  id: RECEIPT_ID,
                  shipment_id: SHIPMENT_ID,
                  receiving_facility_id: VALID_FACILITY_ID,
                  received_by: VALID_USER_ID,
                  status: "complete",
                },
              ],
            };
          }
          if (sql.includes("INSERT INTO receipt_items")) {
            return {
              rows: [
                {
                  id: "item-1",
                  receipt_id: RECEIPT_ID,
                  drug_id: DRUG_ID,
                  batch_id: BATCH_ID,
                  quantity_received: 100,
                  quantity_damaged: 5,
                },
              ],
            };
          }
          if (sql.includes("INSERT INTO stock_ledger")) {
            return { rows: [{ id: "ledger-1" }] };
          }
          if (sql.includes("SELECT id FROM batches")) {
            return { rowCount: 1, rows: [{ id: BATCH_ID }] };
          }
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

    const response = await request(app)
      .post("/api/v1/receipts")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        shipment_id: SHIPMENT_ID,
        receiving_facility_id: VALID_FACILITY_ID,
        items: [
          {
            drug_id: DRUG_ID,
            batch_id: BATCH_ID,
            quantity_received: 100,
            quantity_damaged: 5,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(RECEIPT_ID);
    expect(response.body.data.items).toHaveLength(1);

    // Verify net quantity inserted into stock_ledger was 95 (100 - 5)
    const ledgerCall = mockClient.query.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("INSERT INTO stock_ledger")
    );
    expect(ledgerCall).toBeDefined();
    expect(ledgerCall[1][2]).toBe(95); // quantity = 100 - 5
  });

  it("returns 400 when quantity_damaged exceeds quantity_received", async () => {
    const response = await request(app)
      .post("/api/v1/receipts")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        shipment_id: SHIPMENT_ID,
        receiving_facility_id: VALID_FACILITY_ID,
        items: [
          {
            drug_id: DRUG_ID,
            batch_id: BATCH_ID,
            quantity_received: 50,
            quantity_damaged: 100,
          },
        ],
      });

    expect(response.status).toBe(400);
  });

  it("gets receipt by ID with items", async () => {
    const mockReceipt = {
      id: RECEIPT_ID,
      shipment_id: SHIPMENT_ID,
      receiving_facility_id: VALID_FACILITY_ID,
      status: "complete",
    };
    const mockItems = [
      {
        id: "item-1",
        receipt_id: RECEIPT_ID,
        drug_id: DRUG_ID,
        batch_id: BATCH_ID,
        batch_no: "B2026-1",
        drug_name: "Paracetamol",
        quantity_received: 100,
        quantity_damaged: 0,
      },
    ];

    vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (typeof sql === "string") {
        if (sql.includes("SELECT * FROM receipts")) {
          return { rows: [mockReceipt] };
        }
        if (sql.includes("SELECT ri.*")) {
          return { rows: mockItems };
        }
      }
      return { rows: [] };
    });

    const response = await request(app)
      .get(`/api/v1/receipts/${RECEIPT_ID}`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(RECEIPT_ID);
    expect(response.body.data.items).toEqual(mockItems);
  });
});
