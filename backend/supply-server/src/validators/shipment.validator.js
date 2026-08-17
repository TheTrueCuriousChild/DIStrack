import { z } from "zod";

const createShipmentSchema = z.object({
  supply_order_id: z
    .string({ required_error: "supply_order_id is required" })
    .uuid("supply_order_id must be a valid UUID"),
  tracking_number: z.string().trim().nullable().optional(),
});

const updateShipmentStatusSchema = z.object({
  status: z.enum(["dispatched", "in_transit", "delivered"], {
    required_error: "status is required, must be 'dispatched', 'in_transit', or 'delivered'",
  }),
  location: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const queryShipmentsSchema = z.object({
  supply_order_id: z.string().uuid("supply_order_id must be a valid UUID").optional(),
  status: z.enum(["packing", "dispatched", "in_transit", "delivered", "cancelled"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const shipmentIdParamSchema = z.object({
  id: z.string().uuid("Invalid shipment ID, must be a UUID"),
});

export {
  createShipmentSchema,
  updateShipmentStatusSchema,
  queryShipmentsSchema,
  shipmentIdParamSchema,
};
