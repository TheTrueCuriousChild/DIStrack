import { ApiError } from "../utils/ApiError.js";

const ROLES = new Set(["admin", "government", "hospital_staff", "vendor_staff", "warehouse_staff"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requireIdentity(request, _response, next) {
  const userId = request.header("x-user-id");
  const role = request.header("x-user-role");
  const facilityId = request.header("x-facility-id");
  if (!isUuid(userId) || !ROLES.has(role) || !isUuid(facilityId)) {
    return next(new ApiError(401, "Missing or invalid identity context"));
  }
  request.identity = { userId, role, facilityId };
  return next();
}

function authorizeRoles(...allowedRoles) {
  return (request, _response, next) => {
    if (!allowedRoles.includes(request.identity.role)) {
      return next(new ApiError(403, "You are not allowed to perform this action"));
    }
    return next();
  };
}

export { authorizeRoles, requireIdentity };
