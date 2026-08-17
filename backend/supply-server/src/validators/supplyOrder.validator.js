import { z } from "zod";

const aggregateSupplyOrderSchema = z
  .object({
    drug_id: z
      .string({ required_error: "drug_id is required" })
      .uuid("drug_id must be a valid UUID"),
    vendor_id: z
      .string({ required_error: "vendor_id is required" })
      .uuid("vendor_id must be a valid UUID"),
    indent_item_ids: z
      .array(
        z
          .string({ required_error: "indent_item_id is required" })
          .uuid("Each indent_item_id must be a valid UUID")
      )
      .min(1, "indent_item_ids must contain at least one ID"),
  })
  .refine(
    (data) => {
      const ids = new Set();
      for (const id of data.indent_item_ids) {
        if (ids.has(id)) return false;
        ids.add(id);
      }
      return true;
    },
    {
      message: "Duplicate indent_item_ids are not allowed",
      path: ["indent_item_ids"],
    }
  );

const updateSupplyOrderStatusSchema = z.object({
  status: z.enum(["confirmed", "cancelled"], {
    required_error: "status is required, must be 'confirmed' or 'cancelled'",
  }),
});

const querySupplyOrdersSchema = z.object({
  vendor_id: z.string().uuid("vendor_id must be a valid UUID").optional(),
  status: z.enum(["created", "confirmed", "cancelled"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const supplyOrderIdParamSchema = z.object({
  id: z.string().uuid("Invalid supply order ID, must be a UUID"),
});

export {
  aggregateSupplyOrderSchema,
  updateSupplyOrderStatusSchema,
  querySupplyOrdersSchema,
  supplyOrderIdParamSchema,
};
