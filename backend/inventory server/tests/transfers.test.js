import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const SOURCE_FACILITY_ID = "00000000-0000-4000-8000-000000000002";
const DEST_FACILITY_ID = "00000000-0000-4000-8000-000000000010";
const BATCH_ID = "00000000-0000-4000-8000-000000000004";
const TRANSFER_ID = "00000000-0000-4000-8000-000000000020";

describe("Transfers API", () => {
  it("creates a transfer in pending state without deducting ledger", async () => {
    const mockTransfer = {
      id: TRANSFER_ID,
      from_facility_id: SOURCE_FACILITY_ID,
      to_facility_id: DEST_FACILITY_ID,
      batch_id: BATCH_ID,
      quantity: 50,
      status: "pending",
      reason: "manual redistribution",
      created_by: VALID_USER_ID,
      created_at: new Date().toISOString(),
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [mockTransfer] });

    const response = await request(app)
      .post("/api/v1/transfers")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", SOURCE_FACILITY_ID)
      .send({
        from_facility_id: SOURCE_FACILITY_ID,
        to_facility_id: DEST_FACILITY_ID,
        batch_id: BATCH_ID,
        quantity: 50,
        reason: "manual redistribution",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("pending");
  });

  it("returns 400 when source and destination facilities are identical", async () => {
    const response = await request(app)
      .post("/api/v1/transfers")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", SOURCE_FACILITY_ID)
      .send({
        from_facility_id: SOURCE_FACILITY_ID,
        to_facility_id: SOURCE_FACILITY_ID,
        batch_id: BATCH_ID,
        quantity: 50,
      });

    expect(response.status).toBe(400);
  });

  it("approves pending transfer, transitioning to in_transit and recording negative source ledger movement", async () => {
    const pendingTransfer = {
      id: TRANSFER_ID,
      from_facility_id: SOURCE_FACILITY_ID,
      to_facility_id: DEST_FACILITY_ID,
      batch_id: BATCH_ID,
      quantity: 50,
      status: "pending",
    };

    const inTransitTransfer = {
      ...pendingTransfer,
      status: "in_transit",
    };

    // First query is getTransferById in controller
    vi.spyOn(pool, "query").mockResolvedValueOnce({
      rows: [pendingTransfer],
    });

    const mockClient = {
      query: vi.fn(async (sql) => {
        if (typeof sql === "string") {
          if (sql.includes("BEGIN") || sql.includes("COMMIT")) return {};
          if (
            sql.includes("SELECT * FROM transfers WHERE id = $1 FOR UPDATE")
          ) {
            return { rows: [pendingTransfer] };
          }
          if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
            return { rows: [{ available_stock: 100 }] }; // 100 available >= 50
          }
          if (sql.includes("UPDATE transfers SET status = 'in_transit'")) {
            return { rows: [inTransitTransfer] };
          }
          if (sql.includes("INSERT INTO stock_ledger")) {
            return { rows: [{ id: "ledger-out-1" }] };
          }
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

    const response = await request(app)
      .post(`/api/v1/transfers/${TRANSFER_ID}/approve`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "warehouse_staff")
      .set("x-facility-id", SOURCE_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("in_transit");

    // Verify negative stock ledger insert was made (-50)
    const ledgerCall = mockClient.query.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("INSERT INTO stock_ledger")
    );
    expect(ledgerCall).toBeDefined();
    expect(ledgerCall[1][2]).toBe(-50);
  });

  it("rejects transfer approval with 409 when source facility has insufficient stock", async () => {
    const pendingTransfer = {
      id: TRANSFER_ID,
      from_facility_id: SOURCE_FACILITY_ID,
      to_facility_id: DEST_FACILITY_ID,
      batch_id: BATCH_ID,
      quantity: 50,
      status: "pending",
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({
      rows: [pendingTransfer],
    });

    const mockClient = {
      query: vi.fn(async (sql) => {
        if (typeof sql === "string") {
          if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) return {};
          if (
            sql.includes("SELECT * FROM transfers WHERE id = $1 FOR UPDATE")
          ) {
            return { rows: [pendingTransfer] };
          }
          if (sql.includes("SELECT COALESCE(SUM(quantity), 0)")) {
            return { rows: [{ available_stock: 20 }] }; // 20 available < 50
          }
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

    const response = await request(app)
      .post(`/api/v1/transfers/${TRANSFER_ID}/approve`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "admin")
      .set("x-facility-id", SOURCE_FACILITY_ID);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/insufficient stock/i);
  });

  it("receives in_transit transfer, transitioning to completed and recording positive destination ledger movement", async () => {
    const inTransitTransfer = {
      id: TRANSFER_ID,
      from_facility_id: SOURCE_FACILITY_ID,
      to_facility_id: DEST_FACILITY_ID,
      batch_id: BATCH_ID,
      quantity: 50,
      status: "in_transit",
    };

    const completedTransfer = {
      ...inTransitTransfer,
      status: "completed",
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({
      rows: [inTransitTransfer],
    });

    const mockClient = {
      query: vi.fn(async (sql) => {
        if (typeof sql === "string") {
          if (sql.includes("BEGIN") || sql.includes("COMMIT")) return {};
          if (
            sql.includes("SELECT * FROM transfers WHERE id = $1 FOR UPDATE")
          ) {
            return { rows: [inTransitTransfer] };
          }
          if (sql.includes("UPDATE transfers SET status = 'completed'")) {
            return { rows: [completedTransfer] };
          }
          if (sql.includes("INSERT INTO stock_ledger")) {
            return { rows: [{ id: "ledger-in-1" }] };
          }
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.spyOn(pool, "connect").mockResolvedValue(mockClient);

    const response = await request(app)
      .post(`/api/v1/transfers/${TRANSFER_ID}/receive`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", DEST_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("completed");

    const ledgerCall = mockClient.query.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("INSERT INTO stock_ledger")
    );
    expect(ledgerCall).toBeDefined();
    expect(ledgerCall[1][2]).toBe(50); // positive 50
  });

  it("rejects cancellation of completed transfer with 409", async () => {
    const completedTransfer = {
      id: TRANSFER_ID,
      from_facility_id: SOURCE_FACILITY_ID,
      to_facility_id: DEST_FACILITY_ID,
      batch_id: BATCH_ID,
      quantity: 50,
      status: "completed",
    };

    vi.spyOn(pool, "query").mockResolvedValue({
      rows: [completedTransfer],
    });

    const response = await request(app)
      .post(`/api/v1/transfers/${TRANSFER_ID}/cancel`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", SOURCE_FACILITY_ID);

    expect(response.status).toBe(409);
  });

  it("cancels a pending transfer with 200", async () => {
    const pendingTransfer = {
      id: TRANSFER_ID,
      from_facility_id: SOURCE_FACILITY_ID,
      to_facility_id: DEST_FACILITY_ID,
      batch_id: BATCH_ID,
      quantity: 50,
      status: "pending",
    };
    const cancelledTransfer = {
      ...pendingTransfer,
      status: "cancelled",
    };

    vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (typeof sql === "string") {
        if (sql.includes("SELECT * FROM transfers")) {
          return { rows: [pendingTransfer] };
        }
        if (sql.includes("UPDATE transfers SET status = 'cancelled'")) {
          return { rows: [cancelledTransfer] };
        }
      }
      return { rows: [] };
    });

    const response = await request(app)
      .post(`/api/v1/transfers/${TRANSFER_ID}/cancel`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", SOURCE_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("cancelled");
  });

  it("fetches transfer suggestions", async () => {
    const mockSuggestions = [
      {
        from_facility_id: SOURCE_FACILITY_ID,
        to_facility_id: DEST_FACILITY_ID,
        batch_id: BATCH_ID,
        suggested_quantity: 30,
        source_quantity_on_hand: 130,
        destination_quantity_on_hand: 10,
        expiry_date: "2026-09-01",
      },
    ];

    vi.spyOn(pool, "query").mockResolvedValueOnce({
      rows: mockSuggestions,
    });

    const response = await request(app)
      .get(
        `/api/v1/transfers/suggestions?parent_facility_id=${SOURCE_FACILITY_ID}`
      )
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "warehouse_staff")
      .set("x-facility-id", SOURCE_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(mockSuggestions);
  });
});
