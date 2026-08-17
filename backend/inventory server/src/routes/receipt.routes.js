import { Router } from "express";

import {
  createReceipt,
  getReceiptById,
} from "../controllers/receipt.controller.js";
import {
  authorizeRoles,
  requireIdentity,
} from "../middlewares/identity.middleware.js";

const receiptRouter = Router();

receiptRouter
  .route("/")
  .post(
    requireIdentity,
    authorizeRoles("warehouse_staff", "hospital_staff", "admin", "government"),
    createReceipt
  );

receiptRouter.route("/:id").get(requireIdentity, getReceiptById);

export default receiptRouter;
