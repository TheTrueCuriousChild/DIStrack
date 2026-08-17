import { pool } from "../db/index.js";

async function refreshStockSummary(clientOrPool = pool) {
  await clientOrPool.query("REFRESH MATERIALIZED VIEW stock_summary");
}

async function getAvailableStock(facilityId, batchId, clientOrPool = pool) {
  const result = await clientOrPool.query(
    "SELECT COALESCE(SUM(quantity), 0)::int AS available_stock FROM stock_ledger WHERE facility_id = $1 AND batch_id = $2",
    [facilityId, batchId]
  );
  return Number(result.rows[0]?.available_stock ?? 0);
}

async function findStock({ facilityId, batchId, drugId, lowStockOnly }) {
  const conditions = ["ss.facility_id = $1"];
  const values = [facilityId];
  if (batchId) {
    values.push(batchId);
    conditions.push(`ss.batch_id = $${values.length}`);
  }
  if (drugId) {
    values.push(drugId);
    conditions.push(`b.drug_id = $${values.length}`);
  }
  // First-pass low-stock threshold: quantity_on_hand < 20
  if (lowStockOnly) conditions.push("ss.quantity_on_hand < 20");
  const result = await pool.query(
    `SELECT ss.batch_id, b.drug_id, d.name AS drug_name, b.batch_no, b.expiry_date, ss.quantity_on_hand FROM stock_summary ss JOIN batches b ON b.id = ss.batch_id JOIN drugs d ON d.id = b.drug_id WHERE ${conditions.join(" AND ")} ORDER BY b.expiry_date ASC`,
    values
  );
  return result.rows;
}

async function findLedger({
  facilityId,
  batchId,
  txnType,
  fromDate,
  toDate,
  page,
  limit,
}) {
  const conditions = ["facility_id = $1"];
  const values = [facilityId];
  if (batchId) {
    values.push(batchId);
    conditions.push(`batch_id = $${values.length}`);
  }
  if (txnType) {
    values.push(txnType);
    conditions.push(`txn_type = $${values.length}`);
  }
  if (fromDate) {
    values.push(fromDate);
    conditions.push(`created_at >= $${values.length}`);
  }
  if (toDate) {
    values.push(toDate);
    conditions.push(
      `created_at < ($${values.length}::date + INTERVAL '1 day')`
    );
  }
  const where = conditions.join(" AND ");
  const offset = (page - 1) * limit;
  const [countResult, rowsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total FROM stock_ledger WHERE ${where}`,
      values
    ),
    pool.query(
      `SELECT * FROM stock_ledger WHERE ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);
  return { ledger: rowsResult.rows, total: countResult.rows[0].total };
}

export { findLedger, findStock, getAvailableStock, refreshStockSummary };
