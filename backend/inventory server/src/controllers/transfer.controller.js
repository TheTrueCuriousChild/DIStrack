import { canAccessFacility } from "../middlewares/identity.middleware.js";
import * as transferModel from "../models/transfer.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateParentFacilityId,
  validateTransferCreate,
  validateTransferId,
  validateTransferList,
} from "../validators/transfer.validator.js";

const createTransfer = asyncHandler(async (request, response) => {
  const payload = validateTransferCreate(request.body);

  const hasAccess = await canAccessFacility(
    request.identity,
    payload.from_facility_id
  );
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to the source facility");
  }

  try {
    const createdTransfer = await transferModel.createTransfer({
      fromFacilityId: payload.from_facility_id,
      toFacilityId: payload.to_facility_id,
      batchId: payload.batch_id,
      quantity: payload.quantity,
      reason: payload.reason,
      createdBy: request.identity.userId,
    });

    return response
      .status(201)
      .json(
        new ApiResponse(201, createdTransfer, "Transfer created successfully")
      );
  } catch (error) {
    if (error.code === "23503") {
      throw new ApiError(404, "Facility or batch not found");
    }
    throw error;
  }
});

const listTransfers = asyncHandler(async (request, response) => {
  const { facility_id, status, page, limit } = validateTransferList(
    request.query
  );

  let targetFacilityId = facility_id;
  if (
    request.identity.role === "hospital_staff" ||
    request.identity.role === "warehouse_staff"
  ) {
    if (facility_id) {
      const hasAccess = await canAccessFacility(request.identity, facility_id);
      if (!hasAccess) {
        throw new ApiError(403, "You do not have access to this facility");
      }
    } else if (request.identity.role === "hospital_staff") {
      targetFacilityId = request.identity.facilityId;
    }
  }

  const { transfers, total } = await transferModel.findTransfers({
    facilityId: targetFacilityId,
    status,
    page,
    limit,
  });

  return response
    .status(200)
    .json(
      new ApiResponse(
        200,
        { data: transfers, meta: { page, limit, total } },
        "Transfers fetched successfully"
      )
    );
});

const getTransferById = asyncHandler(async (request, response) => {
  const transferId = validateTransferId(request.params.id);
  const transfer = await transferModel.findTransferById(transferId);

  if (!transfer) {
    throw new ApiError(404, "Transfer not found");
  }

  const [hasFromAccess, hasToAccess] = await Promise.all([
    canAccessFacility(request.identity, transfer.from_facility_id),
    canAccessFacility(request.identity, transfer.to_facility_id),
  ]);

  if (!hasFromAccess && !hasToAccess) {
    throw new ApiError(403, "You do not have access to this transfer");
  }

  return response
    .status(200)
    .json(new ApiResponse(200, transfer, "Transfer fetched successfully"));
});

const approveTransfer = asyncHandler(async (request, response) => {
  const transferId = validateTransferId(request.params.id);
  const transfer = await transferModel.findTransferById(transferId);

  if (!transfer) {
    throw new ApiError(404, "Transfer not found");
  }

  const hasAccess = await canAccessFacility(
    request.identity,
    transfer.from_facility_id
  );
  if (!hasAccess) {
    throw new ApiError(
      403,
      "You do not have permission to approve transfers from this facility"
    );
  }

  const updatedTransfer = await transferModel.approveTransfer({
    transferId,
    actorUserId: request.identity.userId,
  });

  return response
    .status(200)
    .json(
      new ApiResponse(200, updatedTransfer, "Transfer approved successfully")
    );
});

const receiveTransfer = asyncHandler(async (request, response) => {
  const transferId = validateTransferId(request.params.id);
  const transfer = await transferModel.findTransferById(transferId);

  if (!transfer) {
    throw new ApiError(404, "Transfer not found");
  }

  const hasAccess = await canAccessFacility(
    request.identity,
    transfer.to_facility_id
  );
  if (!hasAccess) {
    throw new ApiError(
      403,
      "You do not have permission to receive transfers at this facility"
    );
  }

  const updatedTransfer = await transferModel.receiveTransfer({
    transferId,
    actorUserId: request.identity.userId,
  });

  return response
    .status(200)
    .json(
      new ApiResponse(200, updatedTransfer, "Transfer received successfully")
    );
});

const cancelTransfer = asyncHandler(async (request, response) => {
  const transferId = validateTransferId(request.params.id);
  const transfer = await transferModel.findTransferById(transferId);

  if (!transfer) {
    throw new ApiError(404, "Transfer not found");
  }

  const hasAccess = await canAccessFacility(
    request.identity,
    transfer.from_facility_id
  );
  if (!hasAccess) {
    throw new ApiError(
      403,
      "You do not have permission to cancel this transfer"
    );
  }

  const updatedTransfer = await transferModel.cancelTransfer({ transferId });

  return response
    .status(200)
    .json(
      new ApiResponse(200, updatedTransfer, "Transfer cancelled successfully")
    );
});

const getTransferSuggestions = asyncHandler(async (request, response) => {
  const parentFacilityId = request.query.parent_facility_id
    ? validateParentFacilityId(request.query.parent_facility_id)
    : request.identity.facilityId;

  if (!parentFacilityId) {
    throw new ApiError(400, "parent_facility_id is required");
  }

  const hasAccess = await canAccessFacility(request.identity, parentFacilityId);
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this parent facility");
  }

  const suggestions = await transferModel.findSuggestions(parentFacilityId);

  return response
    .status(200)
    .json(
      new ApiResponse(
        200,
        suggestions,
        "Transfer suggestions fetched successfully"
      )
    );
});

export {
  approveTransfer,
  cancelTransfer,
  createTransfer,
  getTransferById,
  getTransferSuggestions,
  listTransfers,
  receiveTransfer,
};
