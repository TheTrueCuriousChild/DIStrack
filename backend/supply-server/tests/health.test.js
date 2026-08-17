import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("Health Check Endpoints", () => {
  it("GET /api/v1/health should return 200 with supply-server health info without auth headers", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.statusCode).toBe(200);
    expect(res.body.message).toBe("Service is healthy");
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe("healthy");
    expect(res.body.data.service).toBe("supply-server");
    expect(res.body.data.timestamp).toBeDefined();
  });

  it("GET /api/v1/unknown-path should return 404 with standard error envelope", async () => {
    const res = await request(app).get("/api/v1/unknown-path");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(404);
  });
});
