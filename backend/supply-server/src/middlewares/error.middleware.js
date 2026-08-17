import { ApiError } from "../utils/ApiError.js";

function notFoundHandler(request, _response, next) {
  return next(new ApiError(404, `Route ${request.method} ${request.originalUrl} was not found`));
}

function errorHandler(error, _request, response, _next) {
  const apiError =
    error instanceof ApiError ? error : new ApiError(500, error.message || "Internal Server Error");
  return response.status(apiError.statusCode).json({
    statusCode: apiError.statusCode,
    data: apiError.data,
    message: apiError.message,
    success: apiError.success,
    errors: apiError.errors,
  });
}

export { errorHandler, notFoundHandler };
