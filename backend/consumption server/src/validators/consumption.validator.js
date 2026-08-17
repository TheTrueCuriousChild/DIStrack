import { z } from "zod";

import { ApiError } from "../utils/ApiError.js";

const uuidSchema = z.string().uuid({ message: "must be a valid UUID" });

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "must be YYYY-MM-DD" });

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, "Validation failed", result.error.issues);
  }
  return result.data;
}

const createConsumptionSchema = z.object({
  facility_id: uuidSchema,
  batch_id: uuidSchema,
  drug_id: uuidSchema,
  quantity: z.coerce
    .number({ message: "quantity must be a number" })
    .int({ message: "quantity must be an integer" })
    .positive({ message: "quantity must be positive" }),
  consumed_at: z.string().datetime().optional().nullable(),
});

const listConsumptionSchema = z.object({
  facility_id: uuidSchema.optional(),
  batch_id: uuidSchema.optional(),
  drug_id: uuidSchema.optional(),
  from_date: dateSchema.optional(),
  to_date: dateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const validateCreateConsumption = (body) =>
  parseOrThrow(createConsumptionSchema, body);
const validateConsumptionId = (id) => parseOrThrow(uuidSchema, id);
const validateListConsumption = (query) =>
  parseOrThrow(listConsumptionSchema, query);

export {
  validateConsumptionId,
  validateCreateConsumption,
  validateListConsumption,
};
