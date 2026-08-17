import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";

describe("Identity & Middleware Integration", () => {
  it("rejects request with malformed UUID in x-user-id header with 401", async () => {
    const response = await request(app)
      .get("/api/v1/drugs")
      .set("x-user-id", "not-a-valid-uuid")
      .set("x-user-role", "admin")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/missing or invalid identity/i);
  });

  it("rejects request with invalid role with 401", async () => {
    const response = await request(app)
      .get("/api/v1/drugs")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "super_admin")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects request with malformed UUID in x-facility-id header with 401", async () => {
    const response = await request(app)
      .get("/api/v1/drugs")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "admin")
      .set("x-facility-id", "invalid-facility-id");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("returns standard 404 ApiError for undefined api route", async () => {
    const response = await request(app).get("/api/v1/nonexistent-route");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      data: null,
      message: "Route GET /api/v1/nonexistent-route was not found",
      success: false,
      errors: [],
    });
  });

  it("blocks vendor_staff from accessing facility stock with 403", async () => {
    const response = await request(app)
      .get(`/api/v1/facilities/${VALID_FACILITY_ID}/stock`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "vendor_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});
