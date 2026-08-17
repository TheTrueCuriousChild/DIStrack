import express from "express";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import healthRouter from "./routes/health.routes.js";
import shipmentRouter from "./routes/shipment.routes.js";
import supplyOrderRouter from "./routes/supplyOrder.routes.js";
import vendorRouter from "./routes/vendor.routes.js";

const app = express();

app.use(express.json());

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/vendors", vendorRouter);
app.use("/api/v1/supply-orders", supplyOrderRouter);
app.use("/api/v1/shipments", shipmentRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
