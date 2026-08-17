import { pool } from "../db/index.js";
import {
  aggregateSupplyOrder,
  findSupplyOrderById,
  findSupplyOrders,
  updateSupplyOrderStatus,
} from "../models/supplyOrder.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  aggregateSupplyOrderSchema,
  querySupplyOrdersSchema,
  supplyOrderIdParamSchema,
  updateSupplyOrderStatusSchema,
} from "../validators/supplyOrder.validator.js";

/**
 * Aggregates approved indent items into a single supply order (Admin & Government).
 */
const aggregateSupplyOrders = asyncHandler(async (req, res) => {
  const bodyResult = aggregateSupplyOrderSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errors = bodyResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errors);
  }

  const { drug_id, vendor_id, indent_item_ids } = bodyResult.data;
  const { userId } = req.identity;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await aggregateSupplyOrder(client, {
      drug_id,
      vendor_id,
      indent_item_ids,
      created_by: userId,
    });
    await client.query("COMMIT");

    return res
      .status(201)
      .json(new ApiResponse(201, result, "Supply order aggregated and created successfully"));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Retrieves a paginated list of supply orders.
 */
const getSupplyOrders = asyncHandler(async (req, res) => {
  const queryResult = querySupplyOrdersSchema.safeParse(req.query);
  if (!queryResult.success) {
    const errors = queryResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed for query parameters", errors);
  }

  const { vendor_id, status, page, limit } = queryResult.data;
  const result = await findSupplyOrders(pool, { vendor_id, status, page, limit });

  return res.status(200).json(new ApiResponse(200, result, "Supply orders retrieved successfully"));
});

/**
 * Retrieves a single supply order by ID with joined items.
 */
const getSupplyOrderById = asyncHandler(async (req, res) => {
  const paramResult = supplyOrderIdParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid supply order ID format, must be a UUID");
  }

  const { id } = paramResult.data;
  const order = await findSupplyOrderById(pool, id);

  if (!order) {
    throw new ApiError(404, `Supply order with id ${id} not found`);
  }

  return res.status(200).json(new ApiResponse(200, order, "Supply order retrieved successfully"));
});

/**
 * Transitions the status of a supply order.
 * Vendor staff can only modify supply orders assigned to their vendor facility.
 */
const updateSupplyOrderStatusHandler = asyncHandler(async (req, res) => {
  const paramResult = supplyOrderIdParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid supply order ID format, must be a UUID");
  }

  const bodyResult = updateSupplyOrderStatusSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errors = bodyResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errors);
  }

  const { id } = paramResult.data;
  const { status: nextStatus } = bodyResult.data;
  const { role, facilityId } = req.identity;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updatedOrder = await updateSupplyOrderStatus(client, {
      supplyOrderId: id,
      nextStatus,
      userRole: role,
      userFacilityId: facilityId,
    });
    await client.query("COMMIT");

    return res
      .status(200)
      .json(new ApiResponse(200, updatedOrder, `Supply order status updated to '${nextStatus}'`));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

export {
  aggregateSupplyOrders,
  getSupplyOrders,
  getSupplyOrderById,
  updateSupplyOrderStatusHandler,
};
