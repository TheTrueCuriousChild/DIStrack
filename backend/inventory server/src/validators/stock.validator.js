import { z } from "zod";

import { ApiError } from "../utils/ApiError.js";

const uuidSchema = z.string().uuid("must be a valid UUID");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const booleanSchema = z
  .union([
    z.boolean(),
    z.enum(["true", "false"]).transform((value) => value === "true"),
  ])
  .optional();

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "Validation failed", result.error.issues);
  return result.data;
}

const stockQuerySchema = z.object({
  batch_id: uuidSchema.optional(),
  drug_id: uuidSchema.optional(),
  low_stock_only: booleanSchema,
});
const ledgerQuerySchema = z.object({
  batch_id: uuidSchema.optional(),
  txn_type: z
    .enum([
      "receipt",
      "consumption",
      "wastage",
      "transfer_out",
      "transfer_in",
      "adjustment",
    ])
    .optional(),
  from_date: dateSchema.optional(),
  to_date: dateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const validateFacilityId = (id) => parseOrThrow(uuidSchema, id);
const validateLedgerQuery = (query) => parseOrThrow(ledgerQuerySchema, query);
const validateStockQuery = (query) => parseOrThrow(stockQuerySchema, query);

export { validateFacilityId, validateLedgerQuery, validateStockQuery };
