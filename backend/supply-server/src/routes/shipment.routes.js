import { Router } from "express";
import {
  createShipmentHandler,
  getShipmentByIdHandler,
  getShipmentsHandler,
  updateShipmentStatusHandler,
} from "../controllers/shipment.controller.js";
import { authorizeRoles, requireIdentity } from "../middlewares/identity.middleware.js";

const router = Router();

router.use(requireIdentity);

router
  .route("/")
  .get(getShipmentsHandler)
  .post(authorizeRoles("admin", "vendor_staff"), createShipmentHandler);

router.route("/:id").get(getShipmentByIdHandler);

router
  .route("/:id/status")
  .patch(authorizeRoles("admin", "vendor_staff"), updateShipmentStatusHandler);

export default router;
