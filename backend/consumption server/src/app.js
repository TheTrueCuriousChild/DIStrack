import express from "express";

import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";
import consumptionRouter from "./routes/consumption.routes.js";
import healthRouter from "./routes/health.routes.js";

const app = express();

app.use(express.json());

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/consumption", consumptionRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
