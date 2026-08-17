import { pool } from "../db/index.js";

async function findAlerts({ facilityId, type, severity, status, page, limit }) {
  const conditions = [];
  const values = [];

  if (facilityId) {
    values.push(facilityId);
    conditions.push(`facility_id = $${values.length}`);
  }
  if (type) {
    values.push(type);
    conditions.push(`type = $${values.length}`);
  }
  if (severity) {
    values.push(severity);
    conditions.push(`severity = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [countResult, rowsResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM alerts ${where}`, values),
    pool.query(
      `SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);

  return { alerts: rowsResult.rows, total: countResult.rows[0].total };
}

async function findAlertById(alertId) {
  const result = await pool.query("SELECT * FROM alerts WHERE id = $1", [
    alertId,
  ]);
  return result.rows[0] || null;
}

async function updateAlertStatus(alertId, status) {
  if (status === "resolved") {
    const result = await pool.query(
      "UPDATE alerts SET status = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [status, alertId]
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    "UPDATE alerts SET status = $1 WHERE id = $2 RETURNING *",
    [status, alertId]
  );
  return result.rows[0] || null;
}

export { findAlertById, findAlerts, updateAlertStatus };
