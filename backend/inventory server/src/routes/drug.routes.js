import { Router } from "express";

import {
  createDrug,
  getDrugById,
  listDrugs,
  updateDrug,
} from "../controllers/drug.controller.js";

import {
  authorizeRoles,
  requireIdentity,
} from "../middlewares/identity.middleware.js";

const drugRouter = Router();

drugRouter
  .route("/")
  .get(requireIdentity, listDrugs)
  .post(requireIdentity, authorizeRoles("admin", "government"), createDrug);

drugRouter
  .route("/:id")
  .get(requireIdentity, getDrugById)
  .patch(requireIdentity, authorizeRoles("admin", "government"), updateDrug);

export default drugRouter;
