import { canAccessFacility } from "../middlewares/identity.middleware.js";
import * as alertModel from "../models/alert.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateAlertId,
  validateAlertList,
  validateAlertUpdate,
} from "../validators/alert.validator.js";

const listAlerts = asyncHandler(async (request, response) => {
  const { facility_id, type, severity, status, page, limit } =
    validateAlertList(request.query);

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

  const { alerts, total } = await alertModel.findAlerts({
    facilityId: targetFacilityId,
    type,
    severity,
    status,
    page,
    limit,
  });

  return response
    .status(200)
    .json(
      new ApiResponse(
        200,
        { data: alerts, meta: { page, limit, total } },
        "Alerts fetched successfully"
      )
    );
});

const updateAlert = asyncHandler(async (request, response) => {
  const alertId = validateAlertId(request.params.id);
  const payload = validateAlertUpdate(request.body);

  const alert = await alertModel.findAlertById(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }

  const hasAccess = await canAccessFacility(
    request.identity,
    alert.facility_id
  );
  if (!hasAccess) {
    throw new ApiError(403, "You do not have access to this alert");
  }

  const updatedAlert = await alertModel.updateAlertStatus(
    alertId,
    payload.status
  );

  return response
    .status(200)
    .json(new ApiResponse(200, updatedAlert, "Alert updated successfully"));
});

export { listAlerts, updateAlert };
