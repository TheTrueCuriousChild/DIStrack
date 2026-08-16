import { z } from "zod";

import { ApiError } from "../utils/ApiError.js";

const uuidSchema = z.string().uuid("must be a valid UUID");

const optionalTextSchema = z.string().trim().min(1).nullable().optional();

const activeSchema = z
  .union([
    z.boolean(),
    z.enum(["true", "false"]).transform((value) => value === "true"),
  ])
  .optional();

const createDrugSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  category: optionalTextSchema,
  unit: z.string().trim().min(1, "unit is required"),
  storage_condition: optionalTextSchema,
});

const updateDrugSchema = createDrugSchema
  .extend({ active: activeSchema })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one updatable field is required"
  );

const listDrugsSchema = z.object({
  category: optionalTextSchema,
  active: activeSchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function parseOrThrow(schema, value) {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new ApiError(400, "Validation failed", parsed.error.issues);
  }

  return parsed.data;
}

function validateCreateDrug(body) {
  return parseOrThrow(createDrugSchema, body);
}

function validateDrugId(id) {
  return parseOrThrow(uuidSchema, id);
}

function validateListDrugs(query) {
  return parseOrThrow(listDrugsSchema, query);
}

function validateUpdateDrug(body) {
  return parseOrThrow(updateDrugSchema, body);
}

export {
  validateCreateDrug,
  validateDrugId,
  validateListDrugs,
  validateUpdateDrug,
};
