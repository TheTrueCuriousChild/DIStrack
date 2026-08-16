import express from "express";

import drugRouter from "./routes/drug.routes.js";
import healthRouter from "./routes/health.routes.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";

const app = express();

app.use(express.json());
app.use("/api/v1/health", healthRouter);
app.use("/api/v1/drugs", drugRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
