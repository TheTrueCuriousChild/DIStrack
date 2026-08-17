import { ApiError } from "../utils/ApiError.js";

/**
 * Creates an indent along with its items inside a single database transaction.
 */
async function createIndentWithItems(
  client,
  { requesting_facility_id, priority, created_by, items }
) {
  try {
    const indentResult = await client.query(
      `INSERT INTO indents (requesting_facility_id, priority, status, created_by, created_at)
       VALUES ($1, $2, 'submitted', $3, NOW())
       RETURNING *`,
      [requesting_facility_id, priority, created_by]
    );
    const indent = indentResult.rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemResult = await client.query(
        `INSERT INTO indent_items (indent_id, drug_id, quantity_requested, status, created_at)
         VALUES ($1, $2, $3, 'pending', NOW())
         RETURNING *`,
        [indent.id, item.drug_id, item.quantity_requested]
      );
      insertedItems.push(itemResult.rows[0]);
    }

    return {
      indent,
      items: insertedItems,
    };
  } catch (error) {
    if (error.code === "23503") {
      // Foreign key violation
      if (
        error.constraint?.includes("drug") ||
        error.detail?.includes("drug_id") ||
        error.detail?.includes("drugs")
      ) {
        throw new ApiError(400, "One or more drug_id values do not exist in the drugs catalog");
      }
      if (
        error.constraint?.includes("facility") ||
        error.detail?.includes("facility_id") ||
        error.detail?.includes("facilities")
      ) {
        throw new ApiError(400, "The specified requesting_facility_id does not exist");
      }
      throw new ApiError(400, `Invalid reference: ${error.detail || error.message}`);
    }
    throw error;
  }
}

/**
 * Retrieves a paginated list of indents with item_count.
 */
async function findIndents(db, { facilityId, status, priority, page = 1, limit = 20 }) {
  const whereClauses = [];
  const queryParams = [];

  if (facilityId) {
    queryParams.push(facilityId);
    whereClauses.push(`i.requesting_facility_id = $${queryParams.length}`);
  }

  if (status) {
    queryParams.push(status);
    whereClauses.push(`i.status = $${queryParams.length}`);
  }

  if (priority) {
    queryParams.push(priority);
    whereClauses.push(`i.priority = $${queryParams.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Get total count
  const countSql = `SELECT COUNT(*)::int AS total FROM indents i ${whereSql}`;
  const countResult = await db.query(countSql, queryParams);
  const total = countResult.rows[0]?.total || 0;

  // Pagination offsets
  const offset = (page - 1) * limit;
  const listParams = [...queryParams, limit, offset];
  const listSql = `
    SELECT 
      i.*,
      COALESCE(ic.item_count, 0)::int AS item_count
    FROM indents i
    LEFT JOIN (
      SELECT indent_id, COUNT(*)::int AS item_count
      FROM indent_items
      GROUP BY indent_id
    ) ic ON ic.indent_id = i.id
    ${whereSql}
    ORDER BY i.created_at DESC
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
 * Retrieves a single indent by ID along with all its items.
 */
async function findIndentById(db, id) {
  const indentResult = await db.query(`SELECT * FROM indents WHERE id = $1`, [id]);
  if (indentResult.rows.length === 0) {
    return null;
  }

  const indent = indentResult.rows[0];
  const itemsResult = await db.query(
    `SELECT ii.*, d.name AS drug_name, d.dosage_form, d.strength
     FROM indent_items ii
     LEFT JOIN drugs d ON d.id = ii.drug_id
     WHERE ii.indent_id = $1
     ORDER BY ii.created_at ASC`,
    [id]
  );

  return {
    ...indent,
    items: itemsResult.rows,
  };
}

/**
 * Retrieves only the items of an indent.
 */
async function findIndentItemsByIndentId(db, indentId) {
  const itemsResult = await db.query(
    `SELECT ii.*, d.name AS drug_name, d.dosage_form, d.strength
     FROM indent_items ii
     LEFT JOIN drugs d ON d.id = ii.drug_id
     WHERE ii.indent_id = $1
     ORDER BY ii.created_at ASC`,
    [indentId]
  );
  return itemsResult.rows;
}

/**
 * Approves an indent and its items in a transaction.
 */
async function approveIndent(client, { indentId, approvedBy, itemApprovals }) {
  // Lock indent row for update
  const indentCheck = await client.query(`SELECT * FROM indents WHERE id = $1 FOR UPDATE`, [
    indentId,
  ]);

  if (indentCheck.rows.length === 0) {
    throw new ApiError(404, `Indent with id ${indentId} not found`);
  }

  const currentIndent = indentCheck.rows[0];
  if (currentIndent.status !== "submitted") {
    throw new ApiError(
      409,
      `Cannot approve indent in '${currentIndent.status}' status. Only 'submitted' indents can be approved.`
    );
  }

  // Fetch current items
  const itemsCheck = await client.query(
    `SELECT * FROM indent_items WHERE indent_id = $1 FOR UPDATE`,
    [indentId]
  );
  const existingItems = itemsCheck.rows;
  const existingItemMap = new Map(existingItems.map((item) => [item.id, item]));

  // Build approval map
  const approvalMap = new Map();
  if (itemApprovals && itemApprovals.length > 0) {
    for (const app of itemApprovals) {
      if (!existingItemMap.has(app.id)) {
        throw new ApiError(400, `Indent item ${app.id} does not belong to indent ${indentId}`);
      }
      const existingItem = existingItemMap.get(app.id);
      if (app.quantity_approved > existingItem.quantity_requested) {
        throw new ApiError(
          400,
          `Approved quantity (${app.quantity_approved}) cannot exceed requested quantity (${existingItem.quantity_requested}) for item ${app.id}`
        );
      }
      approvalMap.set(app.id, app.quantity_approved);
    }
  }

  // Update indent
  const updatedIndentResult = await client.query(
    `UPDATE indents
     SET status = 'approved',
         approved_by = $2,
         approved_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [indentId, approvedBy]
  );
  const updatedIndent = updatedIndentResult.rows[0];

  // Update each indent item
  const updatedItems = [];
  for (const item of existingItems) {
    const qtyApproved = approvalMap.has(item.id)
      ? approvalMap.get(item.id)
      : item.quantity_requested;

    const itemUpdateResult = await client.query(
      `UPDATE indent_items
       SET status = 'approved',
           quantity_approved = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [item.id, qtyApproved]
    );
    updatedItems.push(itemUpdateResult.rows[0]);
  }

  return {
    indent: updatedIndent,
    items: updatedItems,
  };
}

/**
 * Rejects an indent in a transaction.
 */
async function rejectIndent(client, { indentId, rejectedBy: _rejectedBy, reason: _reason }) {
  const indentCheck = await client.query(`SELECT * FROM indents WHERE id = $1 FOR UPDATE`, [
    indentId,
  ]);

  if (indentCheck.rows.length === 0) {
    throw new ApiError(404, `Indent with id ${indentId} not found`);
  }

  const currentIndent = indentCheck.rows[0];
  if (currentIndent.status !== "submitted") {
    throw new ApiError(
      409,
      `Cannot reject indent in '${currentIndent.status}' status. Only 'submitted' indents can be rejected.`
    );
  }

  // Update indent status to rejected
  const updatedIndentResult = await client.query(
    `UPDATE indents
     SET status = 'rejected',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [indentId]
  );

  // Also update items status to rejected
  await client.query(
    `UPDATE indent_items
     SET status = 'rejected',
         updated_at = NOW()
     WHERE indent_id = $1`,
    [indentId]
  );

  return updatedIndentResult.rows[0];
}

export {
  createIndentWithItems,
  findIndents,
  findIndentById,
  findIndentItemsByIndentId,
  approveIndent,
  rejectIndent,
};
