import { ApiError } from "../utils/ApiError.js";

/**
 * Creates a shipment for a confirmed supply order and logs the initial 'packing' event.
 */
async function createShipment(
  client,
  { supply_order_id, tracking_number, userRole, userFacilityId }
) {
  // 1. Fetch and lock supply order
  const orderRes = await client.query(
    `SELECT so.*, v.facility_id AS vendor_facility_id
     FROM supply_orders so
     LEFT JOIN vendors v ON v.id = so.vendor_id
     WHERE so.id = $1
     FOR UPDATE`,
    [supply_order_id]
  );

  if (orderRes.rows.length === 0) {
    throw new ApiError(404, `Supply order with id ${supply_order_id} not found`);
  }

  const supplyOrder = orderRes.rows[0];

  if (userRole === "vendor_staff" && supplyOrder.vendor_facility_id !== userFacilityId) {
    throw new ApiError(
      403,
      "You are not authorized to create shipments for another vendor facility"
    );
  }

  if (supplyOrder.status !== "confirmed") {
    throw new ApiError(
      409,
      `Cannot create a shipment for a supply order in '${supplyOrder.status}' status. Only 'confirmed' supply orders can be shipped.`
    );
  }

  // 2. Check for active shipment
  const existingShipmentRes = await client.query(
    `SELECT id, status FROM shipments WHERE supply_order_id = $1 AND status != 'cancelled'`,
    [supply_order_id]
  );
  if (existingShipmentRes.rows.length > 0) {
    throw new ApiError(
      409,
      `An active shipment already exists for supply order ${supply_order_id}`
    );
  }

  // 3. Insert shipment
  const shipmentRes = await client.query(
    `INSERT INTO shipments (supply_order_id, tracking_number, status, created_at)
     VALUES ($1, $2, 'packing', NOW())
     RETURNING *`,
    [supply_order_id, tracking_number || null]
  );
  const shipment = shipmentRes.rows[0];

  // 4. Insert initial event
  const eventRes = await client.query(
    `INSERT INTO shipment_events (shipment_id, status, occurred_at)
     VALUES ($1, 'packing', NOW())
     RETURNING *`,
    [shipment.id]
  );
  const initialEvent = eventRes.rows[0];

  return {
    shipment,
    initial_event: initialEvent,
  };
}

/**
 * Retrieves a shipment by ID along with its full event timeline.
 */
async function findShipmentById(db, id) {
  const shipmentRes = await db.query(
    `SELECT 
       s.*, 
       so.vendor_id,
       v.name AS vendor_name,
       v.facility_id AS vendor_facility_id
     FROM shipments s
     JOIN supply_orders so ON so.id = s.supply_order_id
     LEFT JOIN vendors v ON v.id = so.vendor_id
     WHERE s.id = $1`,
    [id]
  );

  if (shipmentRes.rows.length === 0) {
    return null;
  }

  const shipment = shipmentRes.rows[0];

  const eventsRes = await db.query(
    `SELECT * FROM shipment_events
     WHERE shipment_id = $1
     ORDER BY occurred_at ASC`,
    [id]
  );

  return {
    ...shipment,
    events: eventsRes?.rows || [],
  };
}

/**
 * Retrieves a paginated list of shipments.
 */
async function findShipments(db, { supply_order_id, status, page = 1, limit = 20 }) {
  const whereClauses = [];
  const queryParams = [];

  if (supply_order_id) {
    queryParams.push(supply_order_id);
    whereClauses.push(`s.supply_order_id = $${queryParams.length}`);
  }

  if (status) {
    queryParams.push(status);
    whereClauses.push(`s.status = $${queryParams.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM shipments s ${whereSql}`,
    queryParams
  );
  const total = countResult.rows[0]?.total || 0;

  const offset = (page - 1) * limit;
  const listParams = [...queryParams, limit, offset];
  const listSql = `
    SELECT 
      s.*,
      so.vendor_id,
      v.name AS vendor_name
    FROM shipments s
    JOIN supply_orders so ON so.id = s.supply_order_id
    LEFT JOIN vendors v ON v.id = so.vendor_id
    ${whereSql}
    ORDER BY s.created_at DESC
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
 * Transitions shipment status forward in strict sequence:
 * packing -> dispatched -> in_transit -> delivered
 */
async function updateShipmentStatus(
  client,
  { shipmentId, nextStatus, location, notes, userRole, userFacilityId }
) {
  const shipmentRes = await client.query(
    `SELECT 
       s.*, 
       so.vendor_id,
       v.facility_id AS vendor_facility_id
     FROM shipments s
     JOIN supply_orders so ON so.id = s.supply_order_id
     LEFT JOIN vendors v ON v.id = so.vendor_id
     WHERE s.id = $1
     FOR UPDATE`,
    [shipmentId]
  );

  if (shipmentRes.rows.length === 0) {
    throw new ApiError(404, `Shipment with id ${shipmentId} not found`);
  }

  const currentShipment = shipmentRes.rows[0];

  if (userRole === "vendor_staff" && currentShipment.vendor_facility_id !== userFacilityId) {
    throw new ApiError(
      403,
      "You are not authorized to update shipments for another vendor facility"
    );
  }

  const currentStatus = currentShipment.status;

  const validForwardNext = {
    packing: "dispatched",
    dispatched: "in_transit",
    in_transit: "delivered",
  };

  const expectedNext = validForwardNext[currentStatus];
  if (!expectedNext || expectedNext !== nextStatus) {
    throw new ApiError(
      409,
      `Invalid status transition from '${currentStatus}' to '${nextStatus}'. Expected next status: '${expectedNext || "none (terminal state)"}'`
    );
  }

  const isDispatched = nextStatus === "dispatched";
  const isDelivered = nextStatus === "delivered";

  const updateSql = `
    UPDATE shipments
    SET status = $2,
        dispatched_at = CASE WHEN $3 = true THEN NOW() ELSE dispatched_at END,
        delivered_at = CASE WHEN $4 = true THEN NOW() ELSE delivered_at END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const updatedRes = await client.query(updateSql, [
    shipmentId,
    nextStatus,
    isDispatched,
    isDelivered,
  ]);
  const updatedShipment = updatedRes.rows[0];

  const eventRes = await client.query(
    `INSERT INTO shipment_events (shipment_id, status, location, notes, occurred_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING *`,
    [shipmentId, nextStatus, location || null, notes || null]
  );
  const createdEvent = eventRes.rows[0];

  return {
    shipment: updatedShipment,
    event: createdEvent,
  };
}

export { createShipment, findShipmentById, findShipments, updateShipmentStatus };
