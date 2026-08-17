import { z } from "zod";

const createVendorSchema = z.object({
  name: z
    .string({ required_error: "Vendor name is required" })
    .trim()
    .min(1, "Vendor name cannot be empty"),
  contact: z.string().trim().optional(),
  email: z.string().trim().email("Invalid email format").optional().or(z.literal("")),
  facility_id: z.string().uuid("facility_id must be a valid UUID").nullable().optional(),
});

const updateVendorSchema = z
  .object({
    name: z.string().trim().min(1, "Vendor name cannot be empty").optional(),
    contact: z.string().trim().optional(),
    email: z.string().trim().email("Invalid email format").optional().or(z.literal("")),
    active: z.boolean().optional(),
    facility_id: z.string().uuid("facility_id must be a valid UUID").nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

const queryVendorsSchema = z.object({
  active: z
    .string()
    .optional()
    .transform((val) => {
      if (val === "true") return true;
      if (val === "false") return false;
      return undefined;
    }),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const vendorIdParamSchema = z.object({
  id: z.string().uuid("Invalid vendor ID, must be a UUID"),
});

export { createVendorSchema, updateVendorSchema, queryVendorsSchema, vendorIdParamSchema };
