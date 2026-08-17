import { z } from "zod";

const createIndentSchema = z
  .object({
    requesting_facility_id: z
      .string({ required_error: "requesting_facility_id is required" })
      .uuid("requesting_facility_id must be a valid UUID"),
    priority: z.enum(["normal", "urgent", "emergency"]).default("normal"),
    items: z
      .array(
        z.object({
          drug_id: z
            .string({ required_error: "drug_id is required" })
            .uuid("drug_id must be a valid UUID"),
          quantity_requested: z
            .number({ required_error: "quantity_requested is required" })
            .int("quantity_requested must be an integer")
            .positive("quantity_requested must be greater than 0"),
        })
      )
      .min(1, "items array must contain at least one item"),
  })
  .refine(
    (data) => {
      const drugIds = new Set();
      for (const item of data.items) {
        if (drugIds.has(item.drug_id)) {
          return false;
        }
        drugIds.add(item.drug_id);
      }
      return true;
    },
    {
      message: "Duplicate drug_id found in items array",
      path: ["items"],
    }
  );

const approveIndentSchema = z.object({
  items: z
    .array(
      z.object({
        id: z
          .string({ required_error: "Item id is required" })
          .uuid("Item id must be a valid UUID"),
        quantity_approved: z
          .number({ required_error: "quantity_approved is required" })
          .int("quantity_approved must be an integer")
          .nonnegative("quantity_approved must be greater than or equal to 0"),
      })
    )
    .optional(),
});

const rejectIndentSchema = z.object({
  reason: z.string().trim().max(500, "Reason cannot exceed 500 characters").optional(),
});

const queryIndentsSchema = z.object({
  status: z.enum(["submitted", "approved", "rejected", "fulfilled", "cancelled"]).optional(),
  priority: z.enum(["normal", "urgent", "emergency"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const idParamSchema = z.object({
  id: z.string().uuid("Invalid ID format, must be a UUID"),
});

export {
  createIndentSchema,
  approveIndentSchema,
  rejectIndentSchema,
  queryIndentsSchema,
  idParamSchema,
};
