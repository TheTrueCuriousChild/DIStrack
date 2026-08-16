import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getHealth = asyncHandler(async (_request, response) => {
  return response
    .status(200)
    .json(new ApiResponse(200, { status: "ok" }, "Health check done!"));
});

export { getHealth };
