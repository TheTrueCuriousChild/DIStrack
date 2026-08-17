import { z } from "zod";

import { ApiError } from "../utils/ApiError.js";

const uuidSchema = z.string().uuid("must be a valid UUID");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "Validation failed", result.error.issues);
  return result.data;
}

const wastageCreateSchema = z.object({
  facility_id: uuidSchema,
  batch_id: uuidSchema,
  quantity: z.coerce.number().positive(),
  reason: z.enum(["expired", "damaged", "other"]),
});
const wastageListSchema = z.object({
  facility_id: uuidSchema.optional(),
  batch_id: uuidSchema.optional(),
  from_date: dateSchema.optional(),
  to_date: dateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const validateWastageCreate = (body) => parseOrThrow(wastageCreateSchema, body);
const validateWastageList = (query) => parseOrThrow(wastageListSchema, query);

export { validateWastageCreate, validateWastageList };
