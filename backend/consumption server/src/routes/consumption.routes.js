import { Router } from "express";

import {
  createConsumption,
  getConsumptionById,
  listConsumption,
} from "../controllers/consumption.controller.js";
import {
  authorizeRoles,
  requireIdentity,
} from "../middlewares/identity.middleware.js";

const consumptionRouter = Router();

consumptionRouter.use(requireIdentity);

consumptionRouter
  .route("/")
  .post(
    authorizeRoles("admin", "government", "hospital_staff", "warehouse_staff"),
    createConsumption
  )
  .get(
    authorizeRoles("admin", "government", "hospital_staff", "warehouse_staff"),
    listConsumption
  );

consumptionRouter
  .route("/:id")
  .get(
    authorizeRoles("admin", "government", "hospital_staff", "warehouse_staff"),
    getConsumptionById
  );

export default consumptionRouter;
