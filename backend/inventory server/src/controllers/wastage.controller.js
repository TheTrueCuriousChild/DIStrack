import { canAccessFacility } from "../middlewares/identity.middleware.js";
import * as wastageModel from "../models/wastage.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateWastageCreate,
  validateWastageList,
} from "../validators/wastage.validator.js";

const createWastage = asyncHandler(async (request, response) => {
  const payload = validateWastageCreate(request.body);

  const hasAccess = await canAccessFacility(
    request.identity,
    payload.facility_id
  );
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this facility");
  }

  const wastage = await wastageModel.createWastage({
    facilityId: payload.facility_id,
    batchId: payload.batch_id,
    quantity: payload.quantity,
    reason: payload.reason,
    reportedBy: request.identity.userId,
  });

  return response
    .status(201)
    .json(new ApiResponse(201, wastage, "Wastage recorded successfully"));
});

const listWastage = asyncHandler(async (request, response) => {
  const { facility_id, batch_id, from_date, to_date, page, limit } =
    validateWastageList(request.query);

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

  const { wastage, total } = await wastageModel.findWastage({
    facilityId: targetFacilityId,
    batchId: batch_id,
    fromDate: from_date,
    toDate: to_date,
    page,
    limit,
  });

  return response
    .status(200)
    .json(
      new ApiResponse(
        200,
        { data: wastage, meta: { page, limit, total } },
        "Wastage records fetched successfully"
      )
    );
});

export { createWastage, listWastage };
