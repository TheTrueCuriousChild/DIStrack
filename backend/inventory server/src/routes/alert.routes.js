import { Router } from "express";

import { listAlerts, updateAlert } from "../controllers/alert.controller.js";
import {
  authorizeRoles,
  requireIdentity,
} from "../middlewares/identity.middleware.js";

const alertRouter = Router();

alertRouter
  .route("/")
  .get(
    requireIdentity,
    authorizeRoles("hospital_staff", "warehouse_staff", "admin", "government"),
    listAlerts
  );

alertRouter
  .route("/:id")
  .patch(
    requireIdentity,
    authorizeRoles("hospital_staff", "warehouse_staff", "admin", "government"),
    updateAlert
  );

export default alertRouter;
