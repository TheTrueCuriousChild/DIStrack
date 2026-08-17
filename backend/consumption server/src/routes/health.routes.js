import { Router } from "express";

import { getHealth } from "../controllers/health.controller.js";

const healthRouter = Router();

healthRouter.route("/").get(getHealth);

export default healthRouter;
