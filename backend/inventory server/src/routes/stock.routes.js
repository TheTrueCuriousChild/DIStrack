import { Router } from "express";

import { getLedger, getStock } from "../controllers/stock.controller.js";
import {
  authorizeRoles,
  requireIdentity,
} from "../middlewares/identity.middleware.js";

const stockRouter = Router();

stockRouter
  .route("/:id/stock")
  .get(
    requireIdentity,
    authorizeRoles("hospital_staff", "warehouse_staff", "admin", "government"),
    getStock
  );

stockRouter
  .route("/:id/ledger")
  .get(
    requireIdentity,
    authorizeRoles("hospital_staff", "warehouse_staff", "admin", "government"),
    getLedger
  );

export default stockRouter;
