import express from "express";

import healthRouter from "./routes/health.routes.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";

const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
