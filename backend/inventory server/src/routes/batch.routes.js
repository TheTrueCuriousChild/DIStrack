import { Router } from "express";

import {
  createBatch,
  getBatchByIdOrQr,
  getBatchQrImage,
  listBatches,
} from "../controllers/batch.controller.js";
import {
  authorizeRoles,
  requireIdentity,
} from "../middlewares/identity.middleware.js";

const batchRouter = Router();

batchRouter
  .route("/")
  .get(requireIdentity, listBatches)
  .post(
    requireIdentity,
    authorizeRoles("admin", "warehouse_staff"),
    createBatch
  );

batchRouter.route("/:id/qr-image").get(requireIdentity, getBatchQrImage);
batchRouter.route("/:idOrQr").get(requireIdentity, getBatchByIdOrQr);

export default batchRouter;
