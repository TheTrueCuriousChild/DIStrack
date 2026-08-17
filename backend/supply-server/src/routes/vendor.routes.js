import { Router } from "express";
import {
  createVendorHandler,
  getVendorByIdHandler,
  getVendors,
  updateVendorHandler,
} from "../controllers/vendor.controller.js";
import { authorizeRoles, requireIdentity } from "../middlewares/identity.middleware.js";

const router = Router();

router.use(requireIdentity);

router.route("/").get(getVendors).post(authorizeRoles("admin"), createVendorHandler);

router.route("/:id").get(getVendorByIdHandler).patch(authorizeRoles("admin"), updateVendorHandler);

export default router;
