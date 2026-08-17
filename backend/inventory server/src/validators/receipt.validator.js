import { z } from "zod";

import { ApiError } from "../utils/ApiError.js";

const uuidSchema = z.string().uuid("must be a valid UUID");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const quantitySchema = z.coerce.number().nonnegative();

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "Validation failed", result.error.issues);
  return result.data;
}

const receiptItemSchema = z
  .object({
    drug_id: uuidSchema,
    batch_id: uuidSchema.nullable().optional(),
    batch_no: z.string().trim().min(1).optional(),
    manufacturer: z.string().trim().min(1).nullable().optional(),
    manufacturing_date: dateSchema.nullable().optional(),
    expiry_date: dateSchema.optional(),
    quantity_received: quantitySchema,
    quantity_damaged: quantitySchema.default(0),
  })
  .refine(
    (item) => item.batch_id || (item.batch_no && item.expiry_date),
    "Each item needs batch_id or batch_no with expiry_date"
  )
  .refine(
    (item) => item.quantity_damaged <= item.quantity_received,
    "quantity_damaged cannot exceed quantity_received"
  );
const receiptCreateSchema = z.object({
  shipment_id: uuidSchema,
  receiving_facility_id: uuidSchema,
  status: z.enum(["complete", "partial", "damaged"]).default("complete"),
  notes: z.string().trim().nullable().optional(),
  items: z.array(receiptItemSchema).min(1),
});

const validateReceiptCreate = (body) => parseOrThrow(receiptCreateSchema, body);
const validateReceiptId = (id) => parseOrThrow(uuidSchema, id);

export { validateReceiptCreate, validateReceiptId };
