import { Router } from "express";

import {
  createWastage,
  listWastage,
} from "../controllers/wastage.controller.js";
import {
  authorizeRoles,
  requireIdentity,
} from "../middlewares/identity.middleware.js";

const wastageRouter = Router();

wastageRouter
  .route("/")
  .get(
    requireIdentity,
    authorizeRoles("hospital_staff", "warehouse_staff", "admin", "government"),
    listWastage
  )
  .post(
    requireIdentity,
    authorizeRoles("warehouse_staff", "hospital_staff", "admin", "government"),
    createWastage
  );

export default wastageRouter;
