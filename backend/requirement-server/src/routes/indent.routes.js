import { Router } from "express";
import {
  approveIndentHandler,
  createIndent,
  getIndentById,
  getIndentItems,
  getIndents,
  rejectIndentHandler,
} from "../controllers/indent.controller.js";
import { authorizeRoles, requireIdentity } from "../middlewares/identity.middleware.js";

const router = Router();

// All indent routes require identity verification
router.use(requireIdentity);

router
  .route("/")
  .post(authorizeRoles("hospital_staff", "admin", "government"), createIndent)
  .get(getIndents);

router.route("/:id").get(getIndentById);

router.route("/:id/items").get(getIndentItems);

router.route("/:id/approve").patch(authorizeRoles("admin", "government"), approveIndentHandler);

router.route("/:id/reject").patch(authorizeRoles("admin", "government"), rejectIndentHandler);

export default router;
