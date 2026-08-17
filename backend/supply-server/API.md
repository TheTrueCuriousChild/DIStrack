# DIStrack — Supply Server API Documentation

The `supply-server` microservice is responsible for managing pharmaceutical **Vendors**, **Supply Orders** with bulk indent aggregation, and **Shipments** with lifecycle event tracking across the national drug supply chain.

---

## 1. Conventions & Standards

### 1.1 Network & Trust Model

- The supply server is an internal microservice running behind the `api-gateway`.
- It is never exposed directly to public clients or the frontend.
- Authentication (Supabase JWT verification) is performed by `api-gateway`. The gateway attaches verified identity headers:
  - `x-user-id` (UUID): ID of the acting user.
  - `x-user-role` (string): User role (`admin`, `government`, `hospital_staff`, `vendor_staff`, `warehouse_staff`).
  - `x-facility-id` (UUID): ID of the user's primary facility.
- As confirmed by architectural design, this service trusts these headers without re-verifying JWT signatures or calling Supabase Auth.

### 1.2 Standard Response Envelopes

#### Success Envelope

```json
{
  "statusCode": 200,
  "data": {},
  "message": "Success",
  "success": true
}
```

#### Paginated Data Envelope

```json
{
  "statusCode": 200,
  "data": {
    "data": [],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 0
    }
  },
  "message": "Success",
  "success": true
}
```

#### Error Envelope

```json
{
  "statusCode": 400,
  "data": null,
  "message": "Validation failed",
  "success": false,
  "errors": []
}
```

### 1.3 Standard HTTP Status Codes

| Status Code                 | Meaning                    | Usage                                                                         |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `200 OK`                    | Request succeeded          | Successful GET, PATCH                                                         |
| `201 Created`               | Resource created           | Successful POST (vendor, supply order, shipment)                              |
| `400 Bad Request`           | Client validation failure  | Invalid Zod schema, negative quantities, duplicate UUIDs, item state mismatch |
| `401 Unauthorized`          | Missing / invalid identity | Missing or invalid UUID headers, unknown role                                 |
| `403 Forbidden`             | Access denied              | Unauthorized role or vendor staff attempting action outside assigned facility |
| `404 Not Found`             | Resource not found         | Non-existent vendor, supply order, or shipment                                |
| `409 Conflict`              | State transition conflict  | Shipping unconfirmed order, invalid status transitions                        |
| `500 Internal Server Error` | Server failure             | Uncaught server or database error                                             |

### 1.4 Pagination Defaults

- `page`: default `1`
- `limit`: default `20`, maximum `100`

---

## 2. Health Endpoints

### 2.1 Health Check

- **Endpoint**: `GET /api/v1/health`
- **Roles**: Public (No identity headers required)

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "status": "healthy",
    "service": "supply-server",
    "timestamp": "2026-08-17T18:00:00.000Z"
  },
  "message": "Service is healthy",
  "success": true
}
```

---

## 3. Vendors API (`/api/v1/vendors`)

### 3.1 List Vendors

- **Endpoint**: `GET /api/v1/vendors`
- **Roles Required**: Any authenticated user
- **Query Parameters**:
  - `active` (boolean string, optional): Filter by active status (`true` / `false`).
  - `page` (integer, optional, default: 1).
  - `limit` (integer, optional, default: 20, max: 100).

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "data": [
      {
        "id": "33333333-3333-4333-8333-333333333333",
        "name": "Apex Pharmaceuticals",
        "contact": "+91-9876543210",
        "email": "contact@apexpharma.com",
        "facility_id": "22222222-2222-4222-8222-222222222222",
        "active": true,
        "created_at": "2026-08-17T18:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  },
  "message": "Vendors retrieved successfully",
  "success": true
}
```

---

### 3.2 Create Vendor

- **Endpoint**: `POST /api/v1/vendors`
- **Roles Required**: `admin`

#### Request Body

```json
{
  "name": "Apex Pharmaceuticals",
  "contact": "+91-9876543210",
  "email": "contact@apexpharma.com",
  "facility_id": "22222222-2222-4222-8222-222222222222"
}
```

#### Response `201 Created`

```json
{
  "statusCode": 201,
  "data": {
    "id": "33333333-3333-4333-8333-333333333333",
    "name": "Apex Pharmaceuticals",
    "contact": "+91-9876543210",
    "email": "contact@apexpharma.com",
    "facility_id": "22222222-2222-4222-8222-222222222222",
    "active": true,
    "created_at": "2026-08-17T18:00:00.000Z"
  },
  "message": "Vendor created successfully",
  "success": true
}
```

---

### 3.3 Get Vendor By ID

- **Endpoint**: `GET /api/v1/vendors/:id`
- **Roles Required**: Any authenticated user

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "id": "33333333-3333-4333-8333-333333333333",
    "name": "Apex Pharmaceuticals",
    "contact": "+91-9876543210",
    "email": "contact@apexpharma.com",
    "facility_id": "22222222-2222-4222-8222-222222222222",
    "active": true,
    "created_at": "2026-08-17T18:00:00.000Z"
  },
  "message": "Vendor retrieved successfully",
  "success": true
}
```

---

### 3.4 Update Vendor

- **Endpoint**: `PATCH /api/v1/vendors/:id`
- **Roles Required**: `admin`

#### Request Body

```json
{
  "contact": "+91-9999999999",
  "active": false
}
```

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "id": "33333333-3333-4333-8333-333333333333",
    "name": "Apex Pharmaceuticals",
    "contact": "+91-9999999999",
    "email": "contact@apexpharma.com",
    "facility_id": "22222222-2222-4222-8222-222222222222",
    "active": false,
    "created_at": "2026-08-17T18:00:00.000Z",
    "updated_at": "2026-08-17T18:05:00.000Z"
  },
  "message": "Vendor updated successfully",
  "success": true
}
```

---

## 4. Supply Orders API (`/api/v1/supply-orders`)

### 4.1 Aggregate Indent Items into Supply Order

- **Endpoint**: `POST /api/v1/supply-orders/aggregate`
- **Roles Required**: `admin`, `government`
- **Description**: The core aggregation feature of DIStrack. Bundles multiple approved hospital indent items of the same drug into a single consolidated purchase/supply order for a chosen vendor.
- **Transaction Details**:
  1. Validates vendor exists and is active.
  2. Fetches and locks all specified `indent_items`.
  3. Verifies all items are found, in `approved` status, and share the target `drug_id`.
  4. Verifies none of the items are already fulfilled.
  5. Sums the total `quantity_approved`.
  6. Creates a `supply_orders` record (`status='created'`).
  7. Creates a `supply_order_items` record with the aggregated quantity.
  8. Inserts `indent_item_fulfillment` records tracking individual item allocations.
  9. Updates all included `indent_items` status to `fulfilled`.

#### Request Body

```json
{
  "drug_id": "55555555-5555-4555-8555-555555555555",
  "vendor_id": "33333333-3333-4333-8333-333333333333",
  "indent_item_ids": [
    "88888888-8888-4888-8888-888888888888",
    "99999999-9999-4999-8999-999999999999"
  ]
}
```

#### Response `201 Created`

```json
{
  "statusCode": 201,
  "data": {
    "supply_order": {
      "id": "77777777-7777-4777-8777-777777777777",
      "vendor_id": "33333333-3333-4333-8333-333333333333",
      "status": "created",
      "created_by": "11111111-1111-4111-8111-111111111111",
      "created_at": "2026-08-17T18:00:00.000Z"
    },
    "supply_order_item": {
      "id": "aaaa1111-1111-4111-8111-111111111111",
      "supply_order_id": "77777777-7777-4777-8777-777777777777",
      "drug_id": "55555555-5555-4555-8555-555555555555",
      "quantity": 500
    },
    "fulfillment": [
      {
        "indent_item_id": "88888888-8888-4888-8888-888888888888",
        "quantity_allocated": 300
      },
      {
        "indent_item_id": "99999999-9999-4999-8999-999999999999",
        "quantity_allocated": 200
      }
    ]
  },
  "message": "Supply order aggregated and created successfully",
  "success": true
}
```

#### Error Conditions

- `400 Bad Request`: Validation failure (empty items list, duplicate IDs), missing item in DB, item status not `approved`, item drug mismatch, or item already fulfilled.
- `403 Forbidden`: Non-admin / non-government caller.
- `404 Not Found`: Vendor ID not found.

---

### 4.2 List Supply Orders

- **Endpoint**: `GET /api/v1/supply-orders`
- **Roles Required**: Any authenticated user
- **Query Parameters**:
  - `vendor_id` (UUID, optional)
  - `status` (string: `created` / `confirmed` / `cancelled`, optional)
  - `page` (integer, optional, default: 1)
  - `limit` (integer, optional, default: 20, max: 100)

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "data": [
      {
        "id": "77777777-7777-4777-8777-777777777777",
        "vendor_id": "33333333-3333-4333-8333-333333333333",
        "vendor_name": "Apex Pharmaceuticals",
        "status": "created",
        "created_by": "11111111-1111-4111-8111-111111111111",
        "created_at": "2026-08-17T18:00:00.000Z",
        "item_count": 1,
        "total_quantity": 500
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  },
  "message": "Supply orders retrieved successfully",
  "success": true
}
```

---

### 4.3 Get Supply Order By ID

- **Endpoint**: `GET /api/v1/supply-orders/:id`
- **Roles Required**: Any authenticated user

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "id": "77777777-7777-4777-8777-777777777777",
    "vendor_id": "33333333-3333-4333-8333-333333333333",
    "vendor_name": "Apex Pharmaceuticals",
    "status": "created",
    "created_by": "11111111-1111-4111-8111-111111111111",
    "created_at": "2026-08-17T18:00:00.000Z",
    "items": [
      {
        "id": "aaaa1111-1111-4111-8111-111111111111",
        "supply_order_id": "77777777-7777-4777-8777-777777777777",
        "drug_id": "55555555-5555-4555-8555-555555555555",
        "drug_name": "Amoxicillin 500mg",
        "dosage_form": "Capsule",
        "strength": "500mg",
        "quantity": 500
      }
    ]
  },
  "message": "Supply order retrieved successfully",
  "success": true
}
```

---

### 4.4 Update Supply Order Status

- **Endpoint**: `PATCH /api/v1/supply-orders/:id/status`
- **Roles Required**: `admin`, `government`, `vendor_staff`
- **Scoping**: `vendor_staff` can only update orders where the vendor is linked to their `facility_id` (`vendors.facility_id = request.identity.facilityId`). Returns `403` otherwise.
- **Valid Transitions**:
  - `created -> confirmed`
  - `created -> cancelled`
  - `confirmed -> cancelled`
  - Any other transition returns `409 Conflict`.

#### Request Body

```json
{
  "status": "confirmed"
}
```

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "id": "77777777-7777-4777-8777-777777777777",
    "vendor_id": "33333333-3333-4333-8333-333333333333",
    "status": "confirmed",
    "updated_at": "2026-08-17T18:10:00.000Z"
  },
  "message": "Supply order status updated to 'confirmed'",
  "success": true
}
```

---

## 5. Shipments API (`/api/v1/shipments`)

### 5.1 Create Shipment

- **Endpoint**: `POST /api/v1/shipments`
- **Roles Required**: `admin`, `vendor_staff`
- **Scoping**: `vendor_staff` must belong to the facility associated with the supply order's vendor (`403` on mismatch).
- **Behavior**:
  - Fails with `404` if supply order does not exist.
  - Fails with `409` if supply order is not `confirmed`.
  - Fails with `409` if an active (non-cancelled) shipment already exists for the order.
  - In a single transaction:
    - Inserts `shipments` row (`status='packing'`).
    - Inserts first `shipment_events` row (`status='packing'`, `occurred_at=NOW()`).

#### Request Body

```json
{
  "supply_order_id": "77777777-7777-4777-8777-777777777777",
  "tracking_number": "TRK-IND-2026-9876"
}
```

#### Response `201 Created`

```json
{
  "statusCode": 201,
  "data": {
    "shipment": {
      "id": "55555555-5555-4555-8555-555555555555",
      "supply_order_id": "77777777-7777-4777-8777-777777777777",
      "tracking_number": "TRK-IND-2026-9876",
      "status": "packing",
      "created_at": "2026-08-17T18:15:00.000Z",
      "dispatched_at": null,
      "delivered_at": null
    },
    "initial_event": {
      "id": "ee111111-1111-4111-8111-111111111111",
      "shipment_id": "55555555-5555-4555-8555-555555555555",
      "status": "packing",
      "location": null,
      "notes": null,
      "occurred_at": "2026-08-17T18:15:00.000Z"
    }
  },
  "message": "Shipment created successfully",
  "success": true
}
```

---

### 5.2 Update Shipment Status

- **Endpoint**: `PATCH /api/v1/shipments/:id/status`
- **Roles Required**: `admin`, `vendor_staff`
- **Scoping**: `vendor_staff` scoped to vendor facility.
- **Valid Forward Transition Sequence**:
  `packing -> dispatched -> in_transit -> delivered`
  Any skip-ahead or backward transition returns `409 Conflict`.
- **Behavior**:
  - Automatically updates `dispatched_at = NOW()` when transitioning to `dispatched`.
  - Automatically updates `delivered_at = NOW()` when transitioning to `delivered`.
  - Appends a new `shipment_events` row with optional `location` and `notes`.

#### Request Body

```json
{
  "status": "dispatched",
  "location": "Central Distribution Hub, Mumbai",
  "notes": "Loaded on cold-chain transport truck #MH01-9988"
}
```

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "shipment": {
      "id": "55555555-5555-4555-8555-555555555555",
      "supply_order_id": "77777777-7777-4777-8777-777777777777",
      "status": "dispatched",
      "dispatched_at": "2026-08-17T18:20:00.000Z",
      "delivered_at": null,
      "updated_at": "2026-08-17T18:20:00.000Z"
    },
    "event": {
      "id": "ee222222-2222-4222-8222-222222222222",
      "shipment_id": "55555555-5555-4555-8555-555555555555",
      "status": "dispatched",
      "location": "Central Distribution Hub, Mumbai",
      "notes": "Loaded on cold-chain transport truck #MH01-9988",
      "occurred_at": "2026-08-17T18:20:00.000Z"
    }
  },
  "message": "Shipment status updated successfully",
  "success": true
}
```

---

### 5.3 Get Shipment By ID (With Timeline)

- **Endpoint**: `GET /api/v1/shipments/:id`
- **Roles Required**: Any authenticated user
- **Description**: Returns shipment details along with full chronological event timeline (`events` array ordered by `occurred_at ASC`).

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "id": "55555555-5555-4555-8555-555555555555",
    "supply_order_id": "77777777-7777-4777-8777-777777777777",
    "vendor_id": "33333333-3333-4333-8333-333333333333",
    "vendor_name": "Apex Pharmaceuticals",
    "tracking_number": "TRK-IND-2026-9876",
    "status": "in_transit",
    "dispatched_at": "2026-08-17T18:20:00.000Z",
    "delivered_at": null,
    "events": [
      {
        "id": "ee111111-1111-4111-8111-111111111111",
        "shipment_id": "55555555-5555-4555-8555-555555555555",
        "status": "packing",
        "location": null,
        "notes": null,
        "occurred_at": "2026-08-17T18:15:00.000Z"
      },
      {
        "id": "ee222222-2222-4222-8222-222222222222",
        "shipment_id": "55555555-5555-4555-8555-555555555555",
        "status": "dispatched",
        "location": "Central Distribution Hub, Mumbai",
        "notes": "Loaded on cold-chain transport truck #MH01-9988",
        "occurred_at": "2026-08-17T18:20:00.000Z"
      },
      {
        "id": "ee333333-3333-4333-8333-333333333333",
        "shipment_id": "55555555-5555-4555-8555-555555555555",
        "status": "in_transit",
        "location": "Pune Highway Toll Plaza",
        "notes": "In transit to destination facility",
        "occurred_at": "2026-08-17T19:00:00.000Z"
      }
    ]
  },
  "message": "Shipment retrieved successfully",
  "success": true
}
```

---

### 5.4 List Shipments

- **Endpoint**: `GET /api/v1/shipments`
- **Roles Required**: Any authenticated user
- **Query Parameters**:
  - `supply_order_id` (UUID, optional)
  - `status` (string, optional: `packing`, `dispatched`, `in_transit`, `delivered`, `cancelled`)
  - `page` (integer, optional, default: 1)
  - `limit` (integer, optional, default: 20, max: 100)

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "data": [
      {
        "id": "55555555-5555-4555-8555-555555555555",
        "supply_order_id": "77777777-7777-4777-8777-777777777777",
        "vendor_id": "33333333-3333-4333-8333-333333333333",
        "vendor_name": "Apex Pharmaceuticals",
        "status": "in_transit"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  },
  "message": "Shipments retrieved successfully",
  "success": true
}
```

---

## 6. Decisions Requiring Team Confirmation

1. **Shared Middleware Duplication**:
   - `identity.middleware.js` and `error.middleware.js` are currently duplicated across all services (`requirement-server`, `supply-server`, `inventory-server`, `consumption-server`).
   - **Recommendation**: Move into a shared package (`@distrack/shared`) once all microservice branches are merged.

2. **Cross-Service Write into `indent_items`**:
   - During `POST /supply-orders/aggregate`, `supply-server` updates `indent_items.status = 'fulfilled'`. This writes directly into a table owned by `requirement-server`.
   - **Status**: Implemented in atomic SQL transaction across shared DB; requires formal contract sign-off from `requirement-server` maintainers.

3. **Single-Active-Shipment Assumption**:
   - Currently, `POST /shipments` restricts each supply order to have at most one active (non-cancelled) shipment.
   - **Status**: If business rules require partial or multi-consignment shipments per supply order, schema/model updates will be needed.

4. **Inventory Receipt Handoff**:
   - `supply-server` manages the lifecycle until `status = 'delivered'`. It does NOT call `inventory-server` or touch `stock_ledger` / `receipts`.
   - `inventory-server` is solely responsible for receiving shipments into stock when goods physically arrive at a warehouse/hospital.

5. **Test Strategy**:
   - Testing is executed using `vitest` + `supertest` with mocked PostgreSQL `pg.Pool` connection and transactions (`vi.mock("../src/db/index.js")`).
