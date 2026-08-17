import { ApiError } from "../utils/ApiError.js";

/**
 * Inserts a new vendor row.
 */
async function createVendor(db, { name, contact, email, facility_id }) {
  try {
    const result = await db.query(
      `INSERT INTO vendors (name, contact, email, facility_id, active, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       RETURNING *`,
      [name, contact || null, email || null, facility_id || null]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === "23503") {
      throw new ApiError(400, "The specified facility_id does not exist");
    }
    throw error;
  }
}

/**
 * Retrieves a paginated list of vendors with optional active filter.
 */
async function findVendors(db, { active, page = 1, limit = 20 }) {
  const whereClauses = [];
  const queryParams = [];

  if (typeof active === "boolean") {
    queryParams.push(active);
    whereClauses.push(`active = $${queryParams.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM vendors ${whereSql}`,
    queryParams
  );
  const total = countResult.rows[0]?.total || 0;

  const offset = (page - 1) * limit;
  const listParams = [...queryParams, limit, offset];
  const listSql = `
    SELECT * FROM vendors
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
  `;

  const listResult = await db.query(listSql, listParams);

  return {
    data: listResult.rows,
    meta: {
      page,
      limit,
      total,
    },
  };
}

/**
 * Retrieves a vendor by ID.
 */
async function findVendorById(db, id) {
  const result = await db.query(`SELECT * FROM vendors WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

/**
 * Partially updates a vendor by ID.
 */
async function updateVendor(db, id, updateFields) {
  const setClauses = [];
  const queryParams = [id];

  const allowedFields = ["name", "contact", "email", "active", "facility_id"];
  for (const field of allowedFields) {
    if (updateFields[field] !== undefined) {
      queryParams.push(updateFields[field]);
      setClauses.push(`${field} = $${queryParams.length}`);
    }
  }

  if (setClauses.length === 0) {
    return null;
  }

  setClauses.push("updated_at = NOW()");

  try {
    const updateSql = `
      UPDATE vendors
      SET ${setClauses.join(", ")}
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(updateSql, queryParams);
    return result.rows[0] || null;
  } catch (error) {
    if (error.code === "23503") {
      throw new ApiError(400, "The specified facility_id does not exist");
    }
    throw error;
  }
}

export { createVendor, findVendors, findVendorById, updateVendor };
