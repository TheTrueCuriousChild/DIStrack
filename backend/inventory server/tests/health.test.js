import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

describe("GET /api/v1/health", () => {
  it("returns the service health without identity headers", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({
      statusCode: 200,
      data: { status: "ok" },
      message: "Health check done!",
      success: true,
    });
  });

  it("returns the standard not-found error for a nonexistent health path", async () => {
    const response = await request(app).get("/api/v1/health/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      data: null,
      message: "Route GET /api/v1/health/missing was not found",
      success: false,
      errors: [],
    });
  });
});
