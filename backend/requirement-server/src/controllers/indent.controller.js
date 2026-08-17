import { pool } from "../db/index.js";
import {
  approveIndent,
  createIndentWithItems,
  findIndentById,
  findIndents,
  rejectIndent,
} from "../models/indent.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  approveIndentSchema,
  createIndentSchema,
  idParamSchema,
  queryIndentsSchema,
  rejectIndentSchema,
} from "../validators/indent.validator.js";

/**
 * Creates a new indent with items.
 */
const createIndent = asyncHandler(async (req, res) => {
  const parseResult = createIndentSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errorDetails);
  }

  const { requesting_facility_id, priority, items } = parseResult.data;
  const { role, facilityId, userId } = req.identity;

  if (role === "hospital_staff" && requesting_facility_id !== facilityId) {
    throw new ApiError(403, "Hospital staff can only create indents for their assigned facility");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await createIndentWithItems(client, {
      requesting_facility_id,
      priority,
      created_by: userId,
      items,
    });
    await client.query("COMMIT");

    return res.status(201).json(new ApiResponse(201, result, "Indent created successfully"));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Retrieves a paginated list of indents.
 */
const getIndents = asyncHandler(async (req, res) => {
  const parseResult = queryIndentsSchema.safeParse(req.query);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed for query parameters", errorDetails);
  }

  const { status, priority, page, limit } = parseResult.data;
  const { role, facilityId } = req.identity;

  // Hospital staff are strictly scoped to their own facility
  const targetFacilityId = role === "hospital_staff" ? facilityId : null;

  const result = await findIndents(pool, {
    facilityId: targetFacilityId,
    status,
    priority,
    page,
    limit,
  });

  return res.status(200).json(new ApiResponse(200, result, "Indents retrieved successfully"));
});

/**
 * Retrieves a single indent with its items.
 */
const getIndentById = asyncHandler(async (req, res) => {
  const paramResult = idParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid indent ID format, must be a UUID");
  }

  const { id } = paramResult.data;
  const indent = await findIndentById(pool, id);

  if (!indent) {
    throw new ApiError(404, `Indent with id ${id} not found`);
  }

  const { role, facilityId } = req.identity;
  if (role === "hospital_staff" && indent.requesting_facility_id !== facilityId) {
    throw new ApiError(403, "You are not authorized to view indents for another facility");
  }

  return res.status(200).json(new ApiResponse(200, indent, "Indent retrieved successfully"));
});

/**
 * Retrieves only the items of an indent.
 */
const getIndentItems = asyncHandler(async (req, res) => {
  const paramResult = idParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid indent ID format, must be a UUID");
  }

  const { id } = paramResult.data;
  const indent = await findIndentById(pool, id);

  if (!indent) {
    throw new ApiError(404, `Indent with id ${id} not found`);
  }

  const { role, facilityId } = req.identity;
  if (role === "hospital_staff" && indent.requesting_facility_id !== facilityId) {
    throw new ApiError(403, "You are not authorized to view indent items for another facility");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, indent.items, "Indent items retrieved successfully"));
});

/**
 * Approves an indent and updates its item quantities.
 */
const approveIndentHandler = asyncHandler(async (req, res) => {
  const paramResult = idParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid indent ID format, must be a UUID");
  }

  const bodyResult = approveIndentSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errorDetails = bodyResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errorDetails);
  }

  const { id } = paramResult.data;
  const { items } = bodyResult.data;
  const { userId } = req.identity;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await approveIndent(client, {
      indentId: id,
      approvedBy: userId,
      itemApprovals: items,
    });
    await client.query("COMMIT");

    return res.status(200).json(new ApiResponse(200, result, "Indent approved successfully"));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Rejects an indent.
 */
const rejectIndentHandler = asyncHandler(async (req, res) => {
  const paramResult = idParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    throw new ApiError(400, "Invalid indent ID format, must be a UUID");
  }

  const bodyResult = rejectIndentSchema.safeParse(req.body);
  if (!bodyResult.success) {
    const errorDetails = bodyResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    throw new ApiError(400, "Validation failed", errorDetails);
  }

  const { id } = paramResult.data;
  const { reason } = bodyResult.data;
  const { userId } = req.identity;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await rejectIndent(client, {
      indentId: id,
      rejectedBy: userId,
      reason,
    });
    await client.query("COMMIT");

    return res.status(200).json(new ApiResponse(200, result, "Indent rejected successfully"));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

export {
  createIndent,
  getIndents,
  getIndentById,
  getIndentItems,
  approveIndentHandler,
  rejectIndentHandler,
};
