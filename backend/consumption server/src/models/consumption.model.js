import { pool } from "../db/index.js";
import { withTransaction } from "../db/withTransaction.js";
import { ApiError } from "../utils/ApiError.js";

async function recordConsumption({
  facilityId,
  batchId,
  drugId,
  quantity,
  recordedBy,
  consumedAt,
}) {
  return withTransaction(async (client) => {
    // Database-level row lock on batches to serialize competing stock mutations
    const batchResult = await client.query(
      "SELECT id, drug_id FROM batches WHERE id = $1 FOR UPDATE",
      [batchId]
    );

    if (batchResult.rowCount === 0) {
      throw new ApiError(404, "Batch not found");
    }

    if (batchResult.rows[0].drug_id !== drugId) {
      throw new ApiError(400, "Drug ID does not match the batch's drug");
    }

    // Real-time authoritative stock check from append-only stock_ledger
    const stockResult = await client.query(
      "SELECT COALESCE(SUM(quantity), 0)::int AS available_stock FROM stock_ledger WHERE facility_id = $1 AND batch_id = $2",
      [facilityId, batchId]
    );
    const availableStock = Number(stockResult.rows[0]?.available_stock ?? 0);

    if (availableStock < quantity) {
      throw new ApiError(
        409,
        `Insufficient stock for consumption: available ${availableStock}, requested ${quantity}`
      );
    }

    const consumptionResult = await client.query(
      `INSERT INTO consumption (facility_id, batch_id, drug_id, quantity, recorded_by, consumed_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_TIMESTAMP))
       RETURNING id, facility_id, batch_id, drug_id, quantity, recorded_by, consumed_at`,
      [facilityId, batchId, drugId, quantity, recordedBy, consumedAt || null]
    );
    const consumption = consumptionResult.rows[0];

    // Append negative stock movement in stock_ledger
    await client.query(
      `INSERT INTO stock_ledger (facility_id, batch_id, quantity, txn_type, reference_type, reference_id, actor_user_id)
       VALUES ($1, $2, $3, 'consumption', 'consumption', $4, $5)`,
      [facilityId, batchId, -quantity, consumption.id, recordedBy]
    );

    // Refresh stock_summary materialized view inside the transaction
    await client.query("REFRESH MATERIALIZED VIEW stock_summary");

    return consumption;
  });
}

async function findConsumption({
  facilityId,
  batchId,
  drugId,
  fromDate,
  toDate,
  page,
  limit,
}) {
  const conditions = [];
  const values = [];

  if (facilityId) {
    values.push(facilityId);
    conditions.push(`c.facility_id = $${values.length}`);
  }
  if (batchId) {
    values.push(batchId);
    conditions.push(`c.batch_id = $${values.length}`);
  }
  if (drugId) {
    values.push(drugId);
    conditions.push(`c.drug_id = $${values.length}`);
  }
  if (fromDate) {
    values.push(fromDate);
    conditions.push(`c.consumed_at >= $${values.length}`);
  }
  if (toDate) {
    values.push(toDate);
    conditions.push(
      `c.consumed_at < ($${values.length}::date + INTERVAL '1 day')`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [countResult, rowsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total FROM consumption c ${where}`,
      values
    ),
    pool.query(
      `SELECT
         c.id,
         c.facility_id,
         c.batch_id,
         c.drug_id,
         c.quantity,
         c.recorded_by,
         c.consumed_at,
         d.name AS drug_name,
         d.unit AS drug_unit,
         b.batch_no,
         b.expiry_date
       FROM consumption c
       JOIN drugs d ON d.id = c.drug_id
       JOIN batches b ON b.id = c.batch_id
       ${where}
       ORDER BY c.consumed_at DESC, c.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);

  return { consumption: rowsResult.rows, total: countResult.rows[0].total };
}

async function findConsumptionById(consumptionId) {
  const result = await pool.query(
    `SELECT
       c.id,
       c.facility_id,
       c.batch_id,
       c.drug_id,
       c.quantity,
       c.recorded_by,
       c.consumed_at,
       d.name AS drug_name,
       d.unit AS drug_unit,
       b.batch_no,
       b.expiry_date
     FROM consumption c
     JOIN drugs d ON d.id = c.drug_id
     JOIN batches b ON b.id = c.batch_id
     WHERE c.id = $1`,
    [consumptionId]
  );

  return result.rows[0] || null;
}

export { findConsumption, findConsumptionById, recordConsumption };
