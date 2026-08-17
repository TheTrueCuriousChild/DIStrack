import { pool } from "../db/index.js";
import { withTransaction } from "../db/withTransaction.js";
import { ApiError } from "../utils/ApiError.js";
import { getAvailableStock, refreshStockSummary } from "./stock.model.js";

async function createWastage({
  facilityId,
  batchId,
  quantity,
  reason,
  reportedBy,
}) {
  const result = await withTransaction(async (client) => {
    const batchCheck = await client.query(
      "SELECT id FROM batches WHERE id = $1",
      [batchId]
    );
    if (batchCheck.rowCount === 0) {
      throw new ApiError(404, "Batch not found");
    }

    const availableStock = await getAvailableStock(facilityId, batchId, client);
    if (availableStock < quantity) {
      throw new ApiError(
        409,
        `Insufficient stock for wastage: available ${availableStock}, requested ${quantity}`
      );
    }

    const wastageResult = await client.query(
      "INSERT INTO wastage (facility_id, batch_id, quantity, reason, reported_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [facilityId, batchId, quantity, reason, reportedBy]
    );
    const wastage = wastageResult.rows[0];

    await client.query(
      "INSERT INTO stock_ledger (facility_id, batch_id, quantity, txn_type, reference_type, reference_id, actor_user_id) VALUES ($1, $2, $3, 'wastage', 'wastage', $4, $5)",
      [facilityId, batchId, -quantity, wastage.id, reportedBy]
    );

    await refreshStockSummary(client);
    return wastage;
  });

  return result;
}

async function findWastage({
  facilityId,
  batchId,
  fromDate,
  toDate,
  page,
  limit,
}) {
  const conditions = [];
  const values = [];

  if (facilityId) {
    values.push(facilityId);
    conditions.push(`w.facility_id = $${values.length}`);
  }
  if (batchId) {
    values.push(batchId);
    conditions.push(`w.batch_id = $${values.length}`);
  }
  if (fromDate) {
    values.push(fromDate);
    conditions.push(`w.created_at >= $${values.length}`);
  }
  if (toDate) {
    values.push(toDate);
    conditions.push(
      `w.created_at < ($${values.length}::date + INTERVAL '1 day')`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [countResult, rowsResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM wastage w ${where}`, values),
    pool.query(
      `SELECT w.*, b.batch_no, b.expiry_date, d.name AS drug_name
       FROM wastage w
       JOIN batches b ON b.id = w.batch_id
       JOIN drugs d ON d.id = b.drug_id
       ${where}
       ORDER BY w.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);

  return { wastage: rowsResult.rows, total: countResult.rows[0].total };
}

export { createWastage, findWastage };
