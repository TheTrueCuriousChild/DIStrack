import { Router } from "express";

import {
  approveTransfer,
  cancelTransfer,
  createTransfer,
  getTransferById,
  getTransferSuggestions,
  listTransfers,
  receiveTransfer,
} from "../controllers/transfer.controller.js";
import {
  authorizeRoles,
  requireIdentity,
} from "../middlewares/identity.middleware.js";

const transferRouter = Router();

transferRouter
  .route("/")
  .get(requireIdentity, listTransfers)
  .post(
    requireIdentity,
    authorizeRoles("warehouse_staff", "hospital_staff", "admin", "government"),
    createTransfer
  );

transferRouter
  .route("/suggestions")
  .get(requireIdentity, getTransferSuggestions);

transferRouter.route("/:id").get(requireIdentity, getTransferById);

transferRouter
  .route("/:id/approve")
  .post(
    requireIdentity,
    authorizeRoles("warehouse_staff", "admin", "government"),
    approveTransfer
  );

transferRouter
  .route("/:id/receive")
  .post(
    requireIdentity,
    authorizeRoles("warehouse_staff", "hospital_staff", "admin", "government"),
    receiveTransfer
  );

transferRouter
  .route("/:id/cancel")
  .post(
    requireIdentity,
    authorizeRoles("warehouse_staff", "hospital_staff", "admin", "government"),
    cancelTransfer
  );

export default transferRouter;
