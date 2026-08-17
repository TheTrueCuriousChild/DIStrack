import express from "express";

import alertRouter from "./routes/alert.routes.js";
import batchRouter from "./routes/batch.routes.js";
import drugRouter from "./routes/drug.routes.js";
import healthRouter from "./routes/health.routes.js";
import receiptRouter from "./routes/receipt.routes.js";
import stockRouter from "./routes/stock.routes.js";
import transferRouter from "./routes/transfer.routes.js";
import wastageRouter from "./routes/wastage.routes.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";

const app = express();

app.use(express.json());
app.use("/api/v1/health", healthRouter);
app.use("/api/v1/drugs", drugRouter);
app.use("/api/v1/batches", batchRouter);
app.use("/api/v1/receipts", receiptRouter);
app.use("/api/v1/facilities", stockRouter);
app.use("/api/v1/transfers", transferRouter);
app.use("/api/v1/wastage", wastageRouter);
app.use("/api/v1/alerts", alertRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
