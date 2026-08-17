import QRCode from "qrcode";

import * as batchModel from "../models/batch.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateBatchCreate,
  validateBatchId,
  validateBatchList,
} from "../validators/batch.validator.js";

const listBatches = asyncHandler(async (request, response) => {
  const { drug_id, expiring_before, page, limit } = validateBatchList(
    request.query
  );
  const { batches, total } = await batchModel.findBatches({
    drugId: drug_id,
    expiringBefore: expiring_before,
    page,
    limit,
  });

  return response
    .status(200)
    .json(
      new ApiResponse(
        200,
        { data: batches, meta: { page, limit, total } },
        "Batches fetched successfully"
      )
    );
});

const createBatch = asyncHandler(async (request, response) => {
  const payload = validateBatchCreate(request.body);
  try {
    const createdBatch = await batchModel.createBatch({
      drugId: payload.drug_id,
      batchNo: payload.batch_no,
      manufacturer: payload.manufacturer,
      manufacturingDate: payload.manufacturing_date,
      expiryDate: payload.expiry_date,
    });

    return response
      .status(201)
      .json(new ApiResponse(201, createdBatch, "Batch created successfully"));
  } catch (error) {
    if (error.code === "23505") {
      throw new ApiError(
        409,
        "Batch already exists for this drug and batch number"
      );
    }
    if (error.code === "23503") {
      throw new ApiError(404, "Drug not found");
    }
    throw error;
  }
});

const getBatchByIdOrQr = asyncHandler(async (request, response) => {
  const idOrQr = request.params.idOrQr || request.params.id;
  const batch = await batchModel.findBatchByIdOrQr(idOrQr);

  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  return response
    .status(200)
    .json(new ApiResponse(200, batch, "Batch fetched successfully"));
});

const getBatchQrImage = asyncHandler(async (request, response) => {
  const batchId = validateBatchId(request.params.id);
  const batch = await batchModel.findBatchByIdOrQr(batchId);

  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  const qrImageBuffer = await QRCode.toBuffer(batch.qr_code, {
    type: "png",
    width: 300,
    margin: 2,
  });

  response.setHeader("Content-Type", "image/png");
  return response.status(200).send(qrImageBuffer);
});

export { createBatch, getBatchByIdOrQr, getBatchQrImage, listBatches };
