import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { pool } from "../src/db/index.js";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_FACILITY_ID = "00000000-0000-4000-8000-000000000002";
const DRUG_ID = "00000000-0000-4000-8000-000000000003";

describe("Drugs API", () => {
  it("rejects request without identity headers with 401", async () => {
    const response = await request(app).get("/api/v1/drugs");
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("lists drugs for authenticated user", async () => {
    const mockDrugs = [
      {
        id: DRUG_ID,
        name: "Paracetamol",
        category: "analgesic",
        unit: "tablet",
        storage_condition: "room temperature",
        active: true,
      },
    ];

    vi.spyOn(pool, "query").mockImplementation(async (query) => {
      if (typeof query === "string" && query.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return { rows: mockDrugs };
    });

    const response = await request(app)
      .get("/api/v1/drugs?page=1&limit=20")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.data).toEqual(mockDrugs);
    expect(response.body.data.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it("allows admin to create a new drug", async () => {
    const newDrug = {
      id: DRUG_ID,
      name: "Amoxicillin",
      category: "antibiotic",
      unit: "capsule",
      storage_condition: "cool and dry",
      active: true,
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [newDrug] });

    const response = await request(app)
      .post("/api/v1/drugs")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "admin")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        name: "Amoxicillin",
        category: "antibiotic",
        unit: "capsule",
        storage_condition: "cool and dry",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe("Amoxicillin");
  });

  it("forbids hospital_staff from creating a drug with 403", async () => {
    const response = await request(app)
      .post("/api/v1/drugs")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        name: "Amoxicillin",
        unit: "capsule",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("returns 400 when creating a drug with missing required fields", async () => {
    const response = await request(app)
      .post("/api/v1/drugs")
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "admin")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({
        category: "antibiotic",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("gets a single drug by ID", async () => {
    const drug = {
      id: DRUG_ID,
      name: "Paracetamol",
      category: "analgesic",
      unit: "tablet",
      storage_condition: "room temperature",
      active: true,
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [drug] });

    const response = await request(app)
      .get(`/api/v1/drugs/${DRUG_ID}`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(drug);
  });

  it("returns 404 for nonexistent drug", async () => {
    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get(`/api/v1/drugs/${DRUG_ID}`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "hospital_staff")
      .set("x-facility-id", VALID_FACILITY_ID);

    expect(response.status).toBe(404);
  });

  it("allows government role to update drug", async () => {
    const updatedDrug = {
      id: DRUG_ID,
      name: "Paracetamol Extra",
      category: "analgesic",
      unit: "tablet",
      storage_condition: "room temperature",
      active: true,
    };

    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [updatedDrug] });

    const response = await request(app)
      .patch(`/api/v1/drugs/${DRUG_ID}`)
      .set("x-user-id", VALID_USER_ID)
      .set("x-user-role", "government")
      .set("x-facility-id", VALID_FACILITY_ID)
      .send({ name: "Paracetamol Extra" });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Paracetamol Extra");
  });
});
