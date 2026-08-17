import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";

describe("Identity and Authorization Middleware", () => {
  it("rejects request missing x-user-id with 401", async () => {
    const response = await request(app)
      .get("/api/v1/consumption")
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing or invalid identity/i);
  });

  it("rejects request missing x-user-role with 401", async () => {
    const response = await request(app)
      .get("/api/v1/consumption")
      .set("x-user-id", VALID_USER_ID)
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing or invalid identity/i);
  });

  it("rejects request missing x-facility-id with 401", async () => {
    const response = await request(app)
      .get("/api/v1/consumption")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff");

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing or invalid identity/i);
  });

  it("rejects request with invalid UUID format with 401", async () => {
    const response = await request(app)
      .get("/api/v1/consumption")
      .set("x-user-id", "not-a-uuid")
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing or invalid identity/i);
  });

  it("rejects vendor_staff role from accessing consumption with 403", async () => {
    const response = await request(app)
      .get("/api/v1/consumption")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "vendor_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/not allowed/i);
  });

  it("allows authorized role with valid headers", async () => {
    vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (typeof sql === "string" && sql.includes("COUNT(*)")) {
        return { rows: [{ total: 0 }] };
      }
      return { rows: [] };
    });

    const response = await request(app)
      .get("/api/v1/consumption")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data.data).toEqual([]);
  });
});
