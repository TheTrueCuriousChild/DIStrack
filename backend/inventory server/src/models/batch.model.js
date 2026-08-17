import { randomUUID } from "node:crypto";

import { pool } from "../db/index.js";

const BATCH_COLUMNS =
  "b.id, b.drug_id, b.batch_no, b.manufacturer, b.manufacturing_date, b.expiry_date, b.qr_code, b.created_at";

async function findBatches({ drugId, expiringBefore, page, limit }) {
  const conditions = [];
  const values = [];
  if (drugId) {
    values.push(drugId);
    conditions.push(`b.drug_id = $${values.length}`);
  }
  if (expiringBefore) {
    values.push(expiringBefore);
    conditions.push(`b.expiry_date < $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;
  const [countResult, rowsResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM batches b ${where}`, values),
    pool.query(
      `SELECT ${BATCH_COLUMNS}, d.name AS drug_name FROM batches b JOIN drugs d ON d.id = b.drug_id ${where} ORDER BY b.expiry_date ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);
  return { batches: rowsResult.rows, total: countResult.rows[0].total };
}

async function createBatch(batch) {
  const result = await pool.query(
    `INSERT INTO batches (drug_id, batch_no, manufacturer, manufacturing_date, expiry_date, qr_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${BATCH_COLUMNS}`,
    [
      batch.drugId,
      batch.batchNo,
      batch.manufacturer,
      batch.manufacturingDate,
      batch.expiryDate,
      `batch:${randomUUID()}`,
    ]
  );
  return result.rows[0];
}

async function findBatchByIdOrQr(idOrQr) {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idOrQr
    );
  const field = isUuid ? "b.id" : "b.qr_code";
  const result = await pool.query(
    `SELECT ${BATCH_COLUMNS}, d.name AS drug_name, d.category, d.unit, d.storage_condition FROM batches b JOIN drugs d ON d.id = b.drug_id WHERE ${field} = $1`,
    [idOrQr]
  );
  return result.rows[0] || null;
}

export { createBatch, findBatchByIdOrQr, findBatches };
