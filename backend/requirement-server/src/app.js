import express from "express";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import healthRouter from "./routes/health.routes.js";
import indentRouter from "./routes/indent.routes.js";

const app = express();

app.use(express.json());

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/indents", indentRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
