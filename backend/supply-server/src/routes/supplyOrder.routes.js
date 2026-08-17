import { Router } from "express";
import {
  aggregateSupplyOrders,
  getSupplyOrderById,
  getSupplyOrders,
  updateSupplyOrderStatusHandler,
} from "../controllers/supplyOrder.controller.js";
import { authorizeRoles, requireIdentity } from "../middlewares/identity.middleware.js";

const router = Router();

router.use(requireIdentity);

router.post("/aggregate", authorizeRoles("admin", "government"), aggregateSupplyOrders);

router.route("/").get(getSupplyOrders);

router.route("/:id").get(getSupplyOrderById);

router
  .route("/:id/status")
  .patch(authorizeRoles("admin", "government", "vendor_staff"), updateSupplyOrderStatusHandler);

export default router;
