import { canAccessFacility } from "../middlewares/identity.middleware.js";
import * as stockModel from "../models/stock.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateFacilityId,
  validateLedgerQuery,
  validateStockQuery,
} from "../validators/stock.validator.js";

const getStock = asyncHandler(async (request, response) => {
  const facilityId = validateFacilityId(request.params.id);

  const hasAccess = await canAccessFacility(request.identity, facilityId);
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this facility");
  }

  const { batch_id, drug_id, low_stock_only } = validateStockQuery(
    request.query
  );
  const stock = await stockModel.findStock({
    facilityId,
    batchId: batch_id,
    drugId: drug_id,
    lowStockOnly: low_stock_only,
  });

  return response
    .status(200)
    .json(new ApiResponse(200, stock, "Stock fetched successfully"));
});

const getLedger = asyncHandler(async (request, response) => {
  const facilityId = validateFacilityId(request.params.id);

  const hasAccess = await canAccessFacility(request.identity, facilityId);
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this facility");
  }

  const { batch_id, txn_type, from_date, to_date, page, limit } =
    validateLedgerQuery(request.query);
  const { ledger, total } = await stockModel.findLedger({
    facilityId,
    batchId: batch_id,
    txnType: txn_type,
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
        { data: ledger, meta: { page, limit, total } },
        "Stock ledger fetched successfully"
      )
    );
});

export { getLedger, getStock };
