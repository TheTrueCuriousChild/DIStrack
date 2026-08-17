import { pool } from "../db/index.js";
import { withTransaction } from "../db/withTransaction.js";
import { ApiError } from "../utils/ApiError.js";
import { refreshStockSummary } from "./stock.model.js";

async function createReceipt({
  shipmentId,
  facilityId,
  receivedBy,
  status,
  notes,
  items,
}) {
  const result = await withTransaction(async (client) => {
    try {
      const shipmentCheck = await client.query(
        "SELECT id FROM shipments WHERE id = $1",
        [shipmentId]
      );
      if (shipmentCheck.rowCount === 0) {
        throw new ApiError(404, "Shipment not found");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // If table doesn't exist, ignore table check error and let DB constraints handle it
    }

    let receiptResult;
    try {
      receiptResult = await client.query(
        "INSERT INTO receipts (shipment_id, receiving_facility_id, received_by, status, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [shipmentId, facilityId, receivedBy, status, notes]
      );
    } catch (error) {
      if (
        error.code === "23503" &&
        (error.constraint?.includes("shipment") ||
          error.detail?.includes("shipment"))
      ) {
        throw new ApiError(404, "Shipment not found");
      }
      throw error;
    }

    const receipt = receiptResult.rows[0];
    const receiptItems = [];

    for (const item of items) {
      let batchId = item.batch_id;
      if (!batchId) {
        const batchResult = await client.query(
          `INSERT INTO batches (drug_id, batch_no, manufacturer, manufacturing_date, expiry_date, qr_code)
           VALUES ($1, $2, $3, $4, $5, 'batch:' || gen_random_uuid()::text)
           ON CONFLICT (drug_id, batch_no) DO UPDATE SET batch_no = EXCLUDED.batch_no
           RETURNING id`,
          [
            item.drug_id,
            item.batch_no,
            item.manufacturer || null,
            item.manufacturing_date || null,
            item.expiry_date,
          ]
        );
        batchId = batchResult.rows[0].id;
      } else {
        const batchCheck = await client.query(
          "SELECT id FROM batches WHERE id = $1 AND drug_id = $2",
          [batchId, item.drug_id]
        );
        if (batchCheck.rowCount === 0) {
          throw new ApiError(400, "Invalid batch_id for the specified drug");
        }
      }

      const itemResult = await client.query(
        "INSERT INTO receipt_items (receipt_id, drug_id, batch_id, quantity_received, quantity_damaged) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [
          receipt.id,
          item.drug_id,
          batchId,
          item.quantity_received,
          item.quantity_damaged,
        ]
      );

      const netQuantity = item.quantity_received - item.quantity_damaged;
      await client.query(
        "INSERT INTO stock_ledger (facility_id, batch_id, quantity, txn_type, reference_type, reference_id, actor_user_id) VALUES ($1, $2, $3, 'receipt', 'receipt', $4, $5)",
        [facilityId, batchId, netQuantity, receipt.id, receivedBy]
      );

      receiptItems.push(itemResult.rows[0]);
    }

    await refreshStockSummary(client);
    return { ...receipt, items: receiptItems };
  });

  return result;
}

async function findReceiptById(receiptId) {
  const receiptResult = await pool.query(
    "SELECT * FROM receipts WHERE id = $1",
    [receiptId]
  );
  if (!receiptResult.rows[0]) return null;
  const itemsResult = await pool.query(
    "SELECT ri.*, b.batch_no, b.expiry_date, d.name AS drug_name FROM receipt_items ri JOIN batches b ON b.id = ri.batch_id JOIN drugs d ON d.id = ri.drug_id WHERE ri.receipt_id = $1",
    [receiptId]
  );
  return { ...receiptResult.rows[0], items: itemsResult.rows };
}

export { createReceipt, findReceiptById };
