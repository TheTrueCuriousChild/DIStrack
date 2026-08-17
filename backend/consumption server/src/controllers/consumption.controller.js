import { canAccessFacility } from "../middlewares/identity.middleware.js";
import * as consumptionModel from "../models/consumption.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateConsumptionId,
  validateCreateConsumption,
  validateListConsumption,
} from "../validators/consumption.validator.js";

const createConsumption = asyncHandler(async (request, response) => {
  const payload = validateCreateConsumption(request.body);

  const hasAccess = await canAccessFacility(
    request.identity,
    payload.facility_id
  );
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this facility");
  }

  const consumption = await consumptionModel.recordConsumption({
    facilityId: payload.facility_id,
    batchId: payload.batch_id,
    drugId: payload.drug_id,
    quantity: payload.quantity,
    recordedBy: request.identity.userId,
    consumedAt: payload.consumed_at,
  });

  return response
    .status(201)
    .json(
      new ApiResponse(201, consumption, "Consumption recorded successfully")
    );
});

const listConsumption = asyncHandler(async (request, response) => {
  const { facility_id, batch_id, drug_id, from_date, to_date, page, limit } =
    validateListConsumption(request.query);

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

  const { consumption, total } = await consumptionModel.findConsumption({
    facilityId: targetFacilityId,
    batchId: batch_id,
    drugId: drug_id,
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
        { data: consumption, meta: { page, limit, total } },
        "Consumption records fetched successfully"
      )
    );
});

const getConsumptionById = asyncHandler(async (request, response) => {
  const id = validateConsumptionId(request.params.id);
  const consumption = await consumptionModel.findConsumptionById(id);

  if (!consumption) {
    throw new ApiError(404, "Consumption record not found");
  }

  const hasAccess = await canAccessFacility(
    request.identity,
    consumption.facility_id
  );
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this facility");
  }

  return response
    .status(200)
    .json(
      new ApiResponse(
        200,
        consumption,
        "Consumption record fetched successfully"
      )
    );
});

export { createConsumption, getConsumptionById, listConsumption };
