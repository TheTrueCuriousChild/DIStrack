import { canAccessFacility } from "../middlewares/identity.middleware.js";
import * as receiptModel from "../models/receipt.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateReceiptCreate,
  validateReceiptId,
} from "../validators/receipt.validator.js";

const createReceipt = asyncHandler(async (request, response) => {
  const payload = validateReceiptCreate(request.body);

  const hasAccess = await canAccessFacility(
    request.identity,
    payload.receiving_facility_id
  );
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this facility");
  }

  const receipt = await receiptModel.createReceipt({
    shipmentId: payload.shipment_id,
    facilityId: payload.receiving_facility_id,
    receivedBy: request.identity.userId,
    status: payload.status,
    notes: payload.notes,
    items: payload.items,
  });

  return response
    .status(201)
    .json(new ApiResponse(201, receipt, "Receipt created successfully"));
});

const getReceiptById = asyncHandler(async (request, response) => {
  const receiptId = validateReceiptId(request.params.id);
  const receipt = await receiptModel.findReceiptById(receiptId);

  if (!receipt) {
    throw new ApiError(404, "Receipt not found");
  }

  const hasAccess = await canAccessFacility(
    request.identity,
    receipt.receiving_facility_id
  );
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this facility");
  }

  return response
    .status(200)
    .json(new ApiResponse(200, receipt, "Receipt fetched successfully"));
});

export { createReceipt, getReceiptById };
