import { z } from "zod";

import { ApiError } from "../utils/ApiError.js";

const uuidSchema = z.string().uuid("must be a valid UUID");

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "Validation failed", result.error.issues);
  return result.data;
}

const transferCreateSchema = z
  .object({
    from_facility_id: uuidSchema,
    to_facility_id: uuidSchema,
    batch_id: uuidSchema,
    quantity: z.coerce.number().positive(),
    reason: z.string().trim().nullable().optional(),
  })
  .refine(
    (value) => value.from_facility_id !== value.to_facility_id,
    "Source and destination must differ"
  );
const transferListSchema = z.object({
  facility_id: uuidSchema.optional(),
  status: z
    .enum(["pending", "in_transit", "completed", "cancelled"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const validateTransferCreate = (body) =>
  parseOrThrow(transferCreateSchema, body);
const validateTransferId = (id) => parseOrThrow(uuidSchema, id);
const validateTransferList = (query) => parseOrThrow(transferListSchema, query);
const validateParentFacilityId = (id) => parseOrThrow(uuidSchema, id);

export {
  validateParentFacilityId,
  validateTransferCreate,
  validateTransferId,
  validateTransferList,
};
