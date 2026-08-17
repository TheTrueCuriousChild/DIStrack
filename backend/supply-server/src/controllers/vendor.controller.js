import { pool } from "../db/index.js";
import { createVendor, findVendorById, findVendors, updateVendor } from "../models/vendor.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createVendorSchema,
  queryVendorsSchema,
  updateVendorSchema,
  vendorIdParamSchema,
} from "../validators/vendor.validator.js";

/**
 * Retrieves a paginated list of vendors.
 */
const getVendors = asyncHandler(async (req, res) => {
  const queryResult = queryVendorsSchema.safeParse(req.query);
  if (!queryResult.success) {
    const errors = queryResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed for query parameters", errors);
  }

  const { active, page, limit } = queryResult.data;
  const result = await findVendors(pool, { active, page, limit });

  return res.status(200).json(new ApiResponse(200, result, "Vendors retrieved successfully"));
});

/**
 * Creates a new vendor (Admin only).
 */
const createVendorHandler = asyncHandler(async (req, res) => {
  const bodyResult = createVendorSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errors = bodyResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errors);
  }

  const vendor = await createVendor(pool, bodyResult.data);

  return res.status(201).json(new ApiResponse(201, vendor, "Vendor created successfully"));
});

/**
 * Retrieves a single vendor by ID.
 */
const getVendorByIdHandler = asyncHandler(async (req, res) => {
  const paramResult = vendorIdParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid vendor ID format, must be a UUID");
  }

  const { id } = paramResult.data;
  const vendor = await findVendorById(pool, id);

  if (!vendor) {
    throw new ApiError(404, `Vendor with id ${id} not found`);
  }

  return res.status(200).json(new ApiResponse(200, vendor, "Vendor retrieved successfully"));
});

/**
 * Partially updates a vendor by ID (Admin only).
 */
const updateVendorHandler = asyncHandler(async (req, res) => {
  const paramResult = vendorIdParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid vendor ID format, must be a UUID");
  }

  const bodyResult = updateVendorSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errors = bodyResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errors);
  }

  const { id } = paramResult.data;

  // Check existence
  const existingVendor = await findVendorById(pool, id);
  if (!existingVendor) {
    throw new ApiError(404, `Vendor with id ${id} not found`);
  }

  const updatedVendor = await updateVendor(pool, id, bodyResult.data);

  return res.status(200).json(new ApiResponse(200, updatedVendor, "Vendor updated successfully"));
});

export { getVendors, createVendorHandler, getVendorByIdHandler, updateVendorHandler };
