import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";
const ALERT_ID = "00000000-0000-4000-8000-000000000040";

describe("Alerts API", () => {
  it("lists alerts with filters and pagination", async () => {
    const mockAlerts = [
      {
        id: ALERT_ID,
        facility_id: VALID_FACILITY_ID,
        type: "low_stock",
        severity: "high",
        status: "open",
        message: "Stock below threshold",
        created_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (typeof sql === "string" && sql.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return { rows: mockAlerts };
    });

    const response = await request(app)
      .get(
        `/api/v1/alerts?facility_id=${VALID_FACILITY_ID}&type=low_stock&status=open`
      )
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.data).toEqual(mockAlerts);
    expect(response.body.data.meta.total).toBe(1);
  });

  it("updates alert status to acknowledged without setting resolved_at", async () => {
    const existingAlert = {
      id: ALERT_ID,
      facility_id: VALID_FACILITY_ID,
      status: "open",
    };
    const acknowledgedAlert = {
      id: ALERT_ID,
      facility_id: VALID_FACILITY_ID,
      status: "acknowledged",
      resolved_at: null,
    };

    vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (typeof sql === "string") {
        if (sql.includes("SELECT * FROM alerts")) {
          return { rows: [existingAlert] };
        }
        if (sql.includes("UPDATE alerts SET status = $1 WHERE id = $2")) {
          return { rows: [acknowledgedAlert] };
        }
      }
      return { rows: [] };
    });

    const response = await request(app)
      .patch(`/api/v1/alerts/${ALERT_ID}`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({ status: "acknowledged" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("acknowledged");
  });

  it("resolves alert and sets resolved_at", async () => {
    const existingAlert = {
      id: ALERT_ID,
      facility_id: VALID_FACILITY_ID,
      status: "open",
    };
    const resolvedAlert = {
      id: ALERT_ID,
      facility_id: VALID_FACILITY_ID,
      status: "resolved",
      resolved_at: new Date().toISOString(),
    };

    vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (typeof sql === "string") {
        if (sql.includes("SELECT * FROM alerts")) {
          return { rows: [existingAlert] };
        }
        if (sql.includes("resolved_at = CURRENT_TIMESTAMP")) {
          return { rows: [resolvedAlert] };
        }
      }
      return { rows: [] };
    });

    const response = await request(app)
      .patch(`/api/v1/alerts/${ALERT_ID}`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({ status: "resolved" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("resolved");
    expect(response.body.data.resolved_at).toBeTruthy();
  });
});
