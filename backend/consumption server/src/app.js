import express from "express";

import healthRouter from "./routes/health.routes.js";

import { notFoundHandler, errorHandler } from "./middlewares/error.middleware";

const app = express();

app.use(express.json());

app.use("/health", healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
