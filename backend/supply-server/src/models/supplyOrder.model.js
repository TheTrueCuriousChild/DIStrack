import { ApiError } from "../utils/ApiError.js";

/**
 * Aggregates approved indent items into a new supply order within a single transaction.
 */
async function aggregateSupplyOrder(client, { drug_id, vendor_id, indent_item_ids, created_by }) {
  // 1. Verify vendor exists and is active
  const vendorRes = await client.query(
    `SELECT id, name, active, facility_id FROM vendors WHERE id = $1`,
    [vendor_id]
  );
  if (vendorRes.rows.length === 0) {
    throw new ApiError(404, `Vendor with id ${vendor_id} not found`);
  }
  if (!vendorRes.rows[0].active) {
    throw new ApiError(400, `Vendor '${vendorRes.rows[0].name}' is inactive`);
  }

  // 2. Fetch all requested indent items
  const itemsRes = await client.query(
    `SELECT id, indent_id, drug_id, quantity_requested, quantity_approved, status
     FROM indent_items
     WHERE id = ANY($1::uuid[])
     FOR UPDATE`,
    [indent_item_ids]
  );
  const fetchedItems = itemsRes.rows;
  const fetchedItemMap = new Map(fetchedItems.map((item) => [item.id, item]));

  // 3. Verify all requested IDs were found
  const missingIds = indent_item_ids.filter((id) => !fetchedItemMap.has(id));
  if (missingIds.length > 0) {
    throw new ApiError(
      400,
      `The following indent_item_id(s) were not found: ${missingIds.join(", ")}`
    );
  }

  // 4. Validate status, drug match, and quantity for each item
  for (const item of fetchedItems) {
    if (item.status !== "approved") {
      throw new ApiError(
        400,
        `Indent item ${item.id} is not in 'approved' status (current status: '${item.status}')`
      );
    }
    if (item.drug_id !== drug_id) {
      throw new ApiError(
        400,
        `Indent item ${item.id} drug mismatch: expected drug ${drug_id}, found ${item.drug_id}`
      );
    }
    if (!item.quantity_approved || Number(item.quantity_approved) <= 0) {
      throw new ApiError(
        400,
        `Indent item ${item.id} has invalid approved quantity (${item.quantity_approved})`
      );
    }
  }

  // 5. Check if any items are already fulfilled
  const existingFulfillment = await client.query(
    `SELECT indent_item_id FROM indent_item_fulfillment WHERE indent_item_id = ANY($1::uuid[])`,
    [indent_item_ids]
  );
  if (existingFulfillment.rows.length > 0) {
    const alreadyFulfilled = existingFulfillment.rows.map((r) => r.indent_item_id);
    throw new ApiError(
      400,
      `Indent item(s) have already been fulfilled: ${alreadyFulfilled.join(", ")}`
    );
  }

  // 6. Calculate total aggregated quantity
  const totalQuantity = fetchedItems.reduce((sum, item) => sum + Number(item.quantity_approved), 0);

  // 7. Create supply order
  const orderRes = await client.query(
    `INSERT INTO supply_orders (vendor_id, status, created_by, created_at)
     VALUES ($1, 'created', $2, NOW())
     RETURNING *`,
    [vendor_id, created_by]
  );
  const supplyOrder = orderRes.rows[0];

  // 8. Create supply order item
  const orderItemRes = await client.query(
    `INSERT INTO supply_order_items (supply_order_id, drug_id, quantity)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [supplyOrder.id, drug_id, totalQuantity]
  );
  const supplyOrderItem = orderItemRes.rows[0];

  // 9. Record fulfillment links and update indent_items status
  const fulfillmentList = [];
  for (const item of fetchedItems) {
    const fulfillmentRes = await client.query(
      `INSERT INTO indent_item_fulfillment (indent_item_id, supply_order_item_id, quantity_allocated)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [item.id, supplyOrderItem.id, item.quantity_approved]
    );
    fulfillmentList.push({
      indent_item_id: fulfillmentRes.rows[0].indent_item_id,
      quantity_allocated: Number(fulfillmentRes.rows[0].quantity_allocated),
    });
  }

  // 10. Update indent_items status to fulfilled
  await client.query(
    `UPDATE indent_items
     SET status = 'fulfilled',
         updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [indent_item_ids]
  );

  return {
    supply_order: supplyOrder,
    supply_order_item: supplyOrderItem,
    fulfillment: fulfillmentList,
  };
}

/**
 * Retrieves a paginated list of supply orders.
 */
async function findSupplyOrders(db, { vendor_id, status, page = 1, limit = 20 }) {
  const whereClauses = [];
  const queryParams = [];

  if (vendor_id) {
    queryParams.push(vendor_id);
    whereClauses.push(`so.vendor_id = $${queryParams.length}`);
  }

  if (status) {
    queryParams.push(status);
    whereClauses.push(`so.status = $${queryParams.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM supply_orders so ${whereSql}`,
    queryParams
  );
  const total = countResult.rows[0]?.total || 0;

  const offset = (page - 1) * limit;
  const listParams = [...queryParams, limit, offset];
  const listSql = `
    SELECT 
      so.*,
      v.name AS vendor_name,
      COALESCE(items_summary.item_count, 0)::int AS item_count,
      COALESCE(items_summary.total_quantity, 0)::int AS total_quantity
    FROM supply_orders so
    LEFT JOIN vendors v ON v.id = so.vendor_id
    LEFT JOIN (
      SELECT 
        supply_order_id, 
        COUNT(*)::int AS item_count,
        SUM(quantity)::int AS total_quantity
      FROM supply_order_items
      GROUP BY supply_order_id
    ) items_summary ON items_summary.supply_order_id = so.id
    ${whereSql}
    ORDER BY so.created_at DESC
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
 * Retrieves a single supply order by ID with joined items and vendor details.
 */
async function findSupplyOrderById(db, id) {
  const orderResult = await db.query(
    `SELECT so.*, v.name AS vendor_name, v.facility_id AS vendor_facility_id
     FROM supply_orders so
     LEFT JOIN vendors v ON v.id = so.vendor_id
     WHERE so.id = $1`,
    [id]
  );

  if (orderResult.rows.length === 0) {
    return null;
  }

  const order = orderResult.rows[0];

  const itemsResult = await db.query(
    `SELECT soi.*, d.name AS drug_name, d.dosage_form, d.strength
     FROM supply_order_items soi
     LEFT JOIN drugs d ON d.id = soi.drug_id
     WHERE soi.supply_order_id = $1`,
    [id]
  );

  return {
    ...order,
    items: itemsResult?.rows || [],
  };
}

/**
 * Transitions the status of a supply order.
 * Allowed transitions:
 * - created -> confirmed
 * - created -> cancelled
 * - confirmed -> cancelled
 */
async function updateSupplyOrderStatus(
  client,
  { supplyOrderId, nextStatus, userRole, userFacilityId }
) {
  const orderRes = await client.query(
    `SELECT so.*, v.facility_id AS vendor_facility_id
     FROM supply_orders so
     LEFT JOIN vendors v ON v.id = so.vendor_id
     WHERE so.id = $1
     FOR UPDATE`,
    [supplyOrderId]
  );

  if (orderRes.rows.length === 0) {
    throw new ApiError(404, `Supply order with id ${supplyOrderId} not found`);
  }

  const currentOrder = orderRes.rows[0];

  if (userRole === "vendor_staff" && currentOrder.vendor_facility_id !== userFacilityId) {
    throw new ApiError(
      403,
      "You are not authorized to update supply orders for another vendor facility"
    );
  }

  const currentStatus = currentOrder.status;

  const validTransitions = {
    created: ["confirmed", "cancelled"],
    confirmed: ["cancelled"],
    cancelled: [],
  };

  const allowedNext = validTransitions[currentStatus] || [];
  if (!allowedNext.includes(nextStatus)) {
    throw new ApiError(
      409,
      `Invalid status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: ${allowedNext.join(", ") || "none"}`
    );
  }

  const updatedRes = await client.query(
    `UPDATE supply_orders
     SET status = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [supplyOrderId, nextStatus]
  );

  return updatedRes.rows[0];
}

export { aggregateSupplyOrder, findSupplyOrders, findSupplyOrderById, updateSupplyOrderStatus };
