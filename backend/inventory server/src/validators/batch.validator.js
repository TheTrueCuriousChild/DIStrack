import { z } from "zod";

import { ApiError } from "../utils/ApiError.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const uuidSchema = z.string().uuid("must be a valid UUID");
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "Validation failed", result.error.issues);
  return result.data;
}

const batchListSchema = paginationSchema.extend({
  drug_id: uuidSchema.optional(),
  expiring_before: dateSchema.optional(),
});
const batchCreateSchema = z.object({
  drug_id: uuidSchema,
  batch_no: z.string().trim().min(1),
  manufacturer: z.string().trim().min(1).nullable().optional(),
  manufacturing_date: dateSchema.nullable().optional(),
  expiry_date: dateSchema,
});

const validateBatchCreate = (body) => parseOrThrow(batchCreateSchema, body);
const validateBatchId = (id) => parseOrThrow(uuidSchema, id);
const validateBatchList = (query) => parseOrThrow(batchListSchema, query);

export { validateBatchCreate, validateBatchId, validateBatchList };
