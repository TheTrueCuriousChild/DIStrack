import * as drugModel from "../models/drug.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateCreateDrug,
  validateDrugId,
  validateListDrugs,
  validateUpdateDrug,
} from "../validators/drug.validator.js";

const listDrugs = asyncHandler(async (request, response) => {
  const { category, active, page, limit } = validateListDrugs(request.query);
  const { drugs, total } = await drugModel.findDrugs({
    filters: { category, active },
    page,
    limit,
  });

  return response
    .status(200)
    .json(
      new ApiResponse(
        200,
        { data: drugs, meta: { page, limit, total } },
        "Drugs fetched successfully"
      )
    );
});

const createDrug = asyncHandler(async (request, response) => {
  const payload = validateCreateDrug(request.body);
  const createdDrug = await drugModel.createDrug({
    name: payload.name,
    category: payload.category,
    unit: payload.unit,
    storageCondition: payload.storage_condition,
  });

  return response
    .status(201)
    .json(new ApiResponse(201, createdDrug, "Drug created successfully"));
});

const getDrugById = asyncHandler(async (request, response) => {
  const drugId = validateDrugId(request.params.id);
  const drug = await drugModel.findDrugById(drugId);

  if (!drug) {
    throw new ApiError(404, "Drug not found");
  }

  return response
    .status(200)
    .json(new ApiResponse(200, drug, "Drug fetched successfully"));
});

const updateDrug = asyncHandler(async (request, response) => {
  const drugId = validateDrugId(request.params.id);
  const payload = validateUpdateDrug(request.body);
  const updatedDrug = await drugModel.updateDrugById(drugId, {
    ...(payload.name !== undefined && { name: payload.name }),
    ...(payload.category !== undefined && { category: payload.category }),
    ...(payload.unit !== undefined && { unit: payload.unit }),
    ...(payload.storage_condition !== undefined && {
      storageCondition: payload.storage_condition,
    }),
    ...(payload.active !== undefined && { active: payload.active }),
  });

  if (!updatedDrug) {
    throw new ApiError(404, "Drug not found");
  }

  return response
    .status(200)
    .json(new ApiResponse(200, updatedDrug, "Drug updated successfully"));
});

export { createDrug, getDrugById, listDrugs, updateDrug };
