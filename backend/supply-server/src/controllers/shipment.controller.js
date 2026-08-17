import { pool } from "../db/index.js";
import {
  createShipment,
  findShipmentById,
  findShipments,
  updateShipmentStatus,
} from "../models/shipment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createShipmentSchema,
  queryShipmentsSchema,
  shipmentIdParamSchema,
  updateShipmentStatusSchema,
} from "../validators/shipment.validator.js";

/**
 * Creates a new shipment for a confirmed supply order (Admin or Vendor Staff).
 */
const createShipmentHandler = asyncHandler(async (req, res) => {
  const bodyResult = createShipmentSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errors = bodyResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errors);
  }

  const { supply_order_id, tracking_number } = bodyResult.data;
  const { role, facilityId } = req.identity;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await createShipment(client, {
      supply_order_id,
      tracking_number,
      userRole: role,
      userFacilityId: facilityId,
    });
    await client.query("COMMIT");

    return res.status(201).json(new ApiResponse(201, result, "Shipment created successfully"));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Transitions shipment status forward and appends a timeline event.
 */
const updateShipmentStatusHandler = asyncHandler(async (req, res) => {
  const paramResult = shipmentIdParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid shipment ID format, must be a UUID");
  }

  const bodyResult = updateShipmentStatusSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errors = bodyResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errors);
  }

  const { id } = paramResult.data;
  const { status: nextStatus, location, notes } = bodyResult.data;
  const { role, facilityId } = req.identity;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await updateShipmentStatus(client, {
      shipmentId: id,
      nextStatus,
      location,
      notes,
      userRole: role,
      userFacilityId: facilityId,
    });
    await client.query("COMMIT");

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Shipment status updated successfully"));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Retrieves a single shipment by ID with event timeline.
 */
const getShipmentByIdHandler = asyncHandler(async (req, res) => {
  const paramResult = shipmentIdParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid shipment ID format, must be a UUID");
  }

  const { id } = paramResult.data;
  const shipment = await findShipmentById(pool, id);

  if (!shipment) {
    throw new ApiError(404, `Shipment with id ${id} not found`);
  }

  return res.status(200).json(new ApiResponse(200, shipment, "Shipment retrieved successfully"));
});

/**
 * Retrieves a paginated list of shipments.
 */
const getShipmentsHandler = asyncHandler(async (req, res) => {
  const queryResult = queryShipmentsSchema.safeParse(req.query);
  if (!queryResult.success) {
    const errors = queryResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed for query parameters", errors);
  }

  const { supply_order_id, status, page, limit } = queryResult.data;
  const result = await findShipments(pool, { supply_order_id, status, page, limit });

  return res.status(200).json(new ApiResponse(200, result, "Shipments retrieved successfully"));
});

export {
  createShipmentHandler,
  updateShipmentStatusHandler,
  getShipmentByIdHandler,
  getShipmentsHandler,
};
