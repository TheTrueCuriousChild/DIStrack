import { pool } from "../db/index.js";

const DRUG_COLUMNS = `
  id,
  name,
  category,
  unit,
  storage_condition,
  active
`;

async function findDrugs({ filters, page, limit }) {
  const conditions = [];
  const values = [];

  if (filters.category !== undefined) {
    values.push(filters.category);
    conditions.push(`category = $${values.length}`);
  }

  if (filters.active !== undefined) {
    values.push(filters.active);
    conditions.push(`active = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;
  const countQuery = `SELECT COUNT(*)::int AS total FROM drugs ${whereClause}`;
  const listValues = [...values, limit, offset];
  const listQuery = `
    SELECT ${DRUG_COLUMNS}
    FROM drugs
    ${whereClause}
    ORDER BY name ASC, id ASC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;

  const [countResult, listResult] = await Promise.all([
    pool.query(countQuery, values),
    pool.query(listQuery, listValues),
  ]);

  return { drugs: listResult.rows, total: countResult.rows[0].total };
}

async function createDrug({ name, category, unit, storageCondition }) {
  const result = await pool.query(
    `
      INSERT INTO drugs (name, category, unit, storage_condition)
      VALUES ($1, $2, $3, $4)
      RETURNING ${DRUG_COLUMNS}
    `,
    [name, category, unit, storageCondition]
  );

  return result.rows[0];
}

async function findDrugById(drugId) {
  const result = await pool.query(
    `SELECT ${DRUG_COLUMNS} FROM drugs WHERE id = $1`,
    [drugId]
  );

  return result.rows[0] || null;
}

async function updateDrugById(drugId, updates) {
  const columnByField = {
    name: "name",
    category: "category",
    unit: "unit",
    storageCondition: "storage_condition",
    active: "active",
  };
  const entries = Object.entries(updates);
  const assignments = entries.map(
    ([fieldName], index) => `${columnByField[fieldName]} = $${index + 1}`
  );
  const values = entries.map(([, value]) => value);

  const result = await pool.query(
    `
      UPDATE drugs
      SET ${assignments.join(", ")}
      WHERE id = $${values.length + 1}
      RETURNING ${DRUG_COLUMNS}
    `,
    [...values, drugId]
  );

  return result.rows[0] || null;
}

export { createDrug, findDrugById, findDrugs, updateDrugById };
