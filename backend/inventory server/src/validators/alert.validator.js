import { z } from "zod";

import { ApiError } from "../utils/ApiError.js";

const uuidSchema = z.string().uuid("must be a valid UUID");

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "Validation failed", result.error.issues);
  return result.data;
}

const alertListSchema = z.object({
  facility_id: uuidSchema.optional(),
  type: z
    .enum(["low_stock", "expiry", "shipment_delay", "abnormal_consumption"])
    .optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "acknowledged", "resolved"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const alertUpdateSchema = z.object({
  status: z.enum(["acknowledged", "resolved"]),
});

const validateAlertId = (id) => parseOrThrow(uuidSchema, id);
const validateAlertList = (query) => parseOrThrow(alertListSchema, query);
const validateAlertUpdate = (body) => parseOrThrow(alertUpdateSchema, body);

export { validateAlertId, validateAlertList, validateAlertUpdate };
