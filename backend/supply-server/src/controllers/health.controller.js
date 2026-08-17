import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getHealth = asyncHandler(async (_req, res) => {
  const healthData = {
    status: "healthy",
    service: "supply-server",
    timestamp: new Date().toISOString(),
  };

  return res.status(200).json(new ApiResponse(200, healthData, "Service is healthy"));
});

export { getHealth };
