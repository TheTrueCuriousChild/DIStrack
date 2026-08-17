import { withTransaction } from "../db/withTransaction.js";
import { pool } from "../db/index.js";

async function createTransfer({
  fromFacilityId,
  toFacilityId,
  batchId,
  quantity,
  reason,
  createdBy,
}) {
  const result = await pool.query(
    "INSERT INTO transfers (from_facility_id, to_facility_id, batch_id, quantity, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [fromFacilityId, toFacilityId, batchId, quantity, reason, createdBy]
  );
  return result.rows[0];
}

async function findTransfers({ facilityId, status, page, limit }) {
  const conditions = [];
  const values = [];
  if (facilityId) {
    values.push(facilityId);
    conditions.push(
      `(from_facility_id = $${values.length} OR to_facility_id = $${values.length})`
    );
  }
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;
  const [countResult, rowsResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM transfers ${where}`, values),
    pool.query(
      `SELECT * FROM transfers ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);
  return { transfers: rowsResult.rows, total: countResult.rows[0].total };
}

async function findTransferById(transferId) {
  const result = await pool.query("SELECT * FROM transfers WHERE id = $1", [
    transferId,
  ]);
  return result.rows[0] || null;
}

async function transitionTransfer({
  transferId,
  fromStatus,
  toStatus,
  actorUserId,
  direction,
}) {
  return withTransaction(async (client) => {
    const result = await client.query(
      "UPDATE transfers SET status = $1 WHERE id = $2 AND status = $3 RETURNING *",
      [toStatus, transferId, fromStatus]
    );
    if (!result.rows[0]) return null;
    const transfer = result.rows[0];
    if (direction) {
      await client.query(
        "INSERT INTO stock_ledger (facility_id, batch_id, quantity, txn_type, reference_type, reference_id, actor_user_id) VALUES ($1, $2, $3, $4, 'transfer', $5, $6)",
        [
          direction === "out"
            ? transfer.from_facility_id
            : transfer.to_facility_id,
          transfer.batch_id,
          direction === "out" ? -transfer.quantity : transfer.quantity,
          direction === "out" ? "transfer_out" : "transfer_in",
          transfer.id,
          actorUserId,
        ]
      );
    }
    return transfer;
  });
}

async function findSuggestions(parentFacilityId) {
  // First-pass thresholds: source >= 100 units, destination < 20 units, expiry within 30 days.
  const result = await pool.query(
    `WITH sibling_stock AS (SELECT ss.facility_id, ss.batch_id, b.drug_id, b.expiry_date, ss.quantity_on_hand FROM stock_summary ss JOIN facilities f ON f.id = ss.facility_id JOIN batches b ON b.id = ss.batch_id WHERE f.parent_facility_id = $1) SELECT source.facility_id AS from_facility_id, destination.facility_id AS to_facility_id, source.batch_id, LEAST(source.quantity_on_hand - 100, 100 - destination.quantity_on_hand) AS suggested_quantity, source.quantity_on_hand AS source_quantity_on_hand, destination.quantity_on_hand AS destination_quantity_on_hand, source.expiry_date FROM sibling_stock source JOIN sibling_stock destination ON destination.drug_id = source.drug_id AND destination.facility_id <> source.facility_id WHERE source.quantity_on_hand >= 100 AND destination.quantity_on_hand < 20 AND source.expiry_date <= CURRENT_DATE + INTERVAL '30 days' ORDER BY source.expiry_date ASC`,
    [parentFacilityId]
  );
  return result.rows;
}

export {
  createTransfer,
  findSuggestions,
  findTransferById,
  findTransfers,
  transitionTransfer,
};
