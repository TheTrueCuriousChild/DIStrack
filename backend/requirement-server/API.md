# DIStrack — Requirement Server API Documentation

The `requirement-server` microservice is responsible for managing drug requirement requests (**Indents**) and their corresponding items (**Indent Items**). It handles indent creation from hospital facilities, approval workflows by administrative and government authorities, and indents item retrieval.

---

## 1. Conventions & Standards

### 1.1 Network & Trust Model

- The requirement server is an internal microservice running behind the `api-gateway`.
- It is never exposed directly to the public internet or frontend clients.
- Authentication (Supabase JWT verification) is terminated at `api-gateway`. The gateway attaches verified identity headers to all forwarded requests:
  - `x-user-id` (UUID): ID of the acting user.
  - `x-user-role` (string): User role (`admin`, `government`, `hospital_staff`, `vendor_staff`, `warehouse_staff`).
  - `x-facility-id` (UUID): ID of the user's primary facility.
- Per architectural design, this service trusts these headers without re-verifying JWT signatures or calling Supabase Auth.

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

Paginated listings nest array items under `data.data` and metadata under `data.meta`:

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
  "message": "Indents retrieved successfully",
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
  "errors": [
    {
      "field": "items.0.quantity_requested",
      "message": "quantity_requested must be greater than 0"
    }
  ]
}
```

### 1.3 Standard HTTP Status Codes

| Status Code                 | Meaning                    | Usage                                                                                   |
| --------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| `200 OK`                    | Request succeeded          | Successful GET, PATCH, status changes                                                   |
| `201 Created`               | Resource created           | Successful POST (indent creation)                                                       |
| `400 Bad Request`           | Client validation failure  | Invalid Zod schema, negative quantities, duplicate drug IDs, non-existent FK references |
| `401 Unauthorized`          | Missing / invalid identity | Missing or non-UUID headers, invalid role header                                        |
| `403 Forbidden`             | Access denied              | Unauthorized role or hospital staff attempting to access another facility's records     |
| `404 Not Found`             | Resource not found         | Indent or item does not exist                                                           |
| `409 Conflict`              | State transition error     | Approving or rejecting an indent that is not in `submitted` state                       |
| `500 Internal Server Error` | Server failure             | Uncaught server or database error                                                       |

### 1.4 Pagination Defaults

- `page`: default `1`
- `limit`: default `20`, maximum `100`

---

## 2. Health Endpoints

### 2.1 Health Check

- **Endpoint**: `GET /api/v1/health`
- **Roles**: Public (No identity headers required)
- **Description**: Verifies service liveness and runtime readiness.

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "status": "healthy",
    "service": "requirement-server",
    "timestamp": "2026-08-17T17:50:00.000Z"
  },
  "message": "Service is healthy",
  "success": true
}
```

---

## 3. Indents API (`/api/v1/indents`)

### 3.1 Create Indent

- **Endpoint**: `POST /api/v1/indents`
- **Roles Required**: `hospital_staff`, `admin`, `government`
- **Scoping**:
  - `hospital_staff`: Can only create indents where `requesting_facility_id === request.identity.facilityId` (returns `403` otherwise).
  - `admin`, `government`: Unscoped (can create on behalf of any facility).

#### Request Headers

```http
x-user-id: 11111111-1111-4111-8111-111111111111
x-user-role: hospital_staff
x-facility-id: 22222222-2222-4222-8222-222222222222
Content-Type: application/json
```

#### Request Body

```json
{
  "requesting_facility_id": "22222222-2222-4222-8222-222222222222",
  "priority": "urgent",
  "items": [
    {
      "drug_id": "44444444-4444-4444-8444-444444444444",
      "quantity_requested": 500
    },
    {
      "drug_id": "55555555-5555-4555-8555-555555555555",
      "quantity_requested": 200
    }
  ]
}
```

#### Response `201 Created`

```json
{
  "statusCode": 201,
  "data": {
    "indent": {
      "id": "66666666-6666-4666-8666-666666666666",
      "requesting_facility_id": "22222222-2222-4222-8222-222222222222",
      "priority": "urgent",
      "status": "submitted",
      "created_by": "11111111-1111-4111-8111-111111111111",
      "created_at": "2026-08-17T17:50:00.000Z",
      "approved_by": null,
      "approved_at": null,
      "updated_at": null
    },
    "items": [
      {
        "id": "77777777-7777-4777-8777-777777777777",
        "indent_id": "66666666-6666-4666-8666-666666666666",
        "drug_id": "44444444-4444-4444-8444-444444444444",
        "quantity_requested": 500,
        "quantity_approved": null,
        "status": "pending",
        "created_at": "2026-08-17T17:50:00.000Z"
      }
    ]
  },
  "message": "Indent created successfully",
  "success": true
}
```

#### Error Conditions

- `400 Bad Request`: Validation failure (empty items array, non-UUIDs, negative quantities, duplicate `drug_id` in same request, or non-existent `drug_id`).
- `401 Unauthorized`: Missing or invalid `x-user-id`, `x-user-role`, or `x-facility-id`.
- `403 Forbidden`: `hospital_staff` attempting to create for another facility, or unauthorized role (`vendor_staff`, `warehouse_staff`).

---

### 3.2 List Indents

- **Endpoint**: `GET /api/v1/indents`
- **Roles Required**: Any authenticated user (`admin`, `government`, `hospital_staff`, `vendor_staff`, `warehouse_staff`).
- **Scoping**:
  - `hospital_staff`: Results automatically filtered to `requesting_facility_id = request.identity.facilityId`.
  - Non-hospital roles: Default unscoped (sees all facilities).
- **Query Parameters**:
  - `status` (string, optional): Filter by indent status (`submitted`, `approved`, `rejected`, `fulfilled`, `cancelled`).
  - `priority` (string, optional): Filter by priority (`normal`, `urgent`, `emergency`).
  - `page` (integer, optional, default: 1).
  - `limit` (integer, optional, default: 20, max: 100).

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "data": [
      {
        "id": "66666666-6666-4666-8666-666666666666",
        "requesting_facility_id": "22222222-2222-4222-8222-222222222222",
        "priority": "urgent",
        "status": "submitted",
        "created_by": "11111111-1111-4111-8111-111111111111",
        "created_at": "2026-08-17T17:50:00.000Z",
        "approved_by": null,
        "approved_at": null,
        "updated_at": null,
        "item_count": 2
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  },
  "message": "Indents retrieved successfully",
  "success": true
}
```

---

### 3.3 Get Indent By ID

- **Endpoint**: `GET /api/v1/indents/:id`
- **Roles Required**: Any authenticated user.
- **Scoping**: `hospital_staff` receives `403` if indent's `requesting_facility_id !== request.identity.facilityId`.

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "id": "66666666-6666-4666-8666-666666666666",
    "requesting_facility_id": "22222222-2222-4222-8222-222222222222",
    "priority": "urgent",
    "status": "submitted",
    "created_by": "11111111-1111-4111-8111-111111111111",
    "created_at": "2026-08-17T17:50:00.000Z",
    "approved_by": null,
    "approved_at": null,
    "updated_at": null,
    "items": [
      {
        "id": "77777777-7777-4777-8777-777777777777",
        "indent_id": "66666666-6666-4666-8666-666666666666",
        "drug_id": "44444444-4444-4444-8444-444444444444",
        "drug_name": "Paracetamol 500mg",
        "dosage_form": "Tablet",
        "strength": "500mg",
        "quantity_requested": 500,
        "quantity_approved": null,
        "status": "pending",
        "created_at": "2026-08-17T17:50:00.000Z"
      }
    ]
  },
  "message": "Indent retrieved successfully",
  "success": true
}
```

#### Error Conditions

- `403 Forbidden`: `hospital_staff` attempting to view indent from another facility.
- `404 Not Found`: Indent ID does not exist.

---

### 3.4 Get Indent Items

- **Endpoint**: `GET /api/v1/indents/:id/items`
- **Roles Required**: Any authenticated user (facility-scoped for `hospital_staff`).
- **Description**: Convenience endpoint returning only the array of `indent_items` for an indent.

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": [
    {
      "id": "77777777-7777-4777-8777-777777777777",
      "indent_id": "66666666-6666-4666-8666-666666666666",
      "drug_id": "44444444-4444-4444-8444-444444444444",
      "drug_name": "Paracetamol 500mg",
      "dosage_form": "Tablet",
      "strength": "500mg",
      "quantity_requested": 500,
      "quantity_approved": null,
      "status": "pending",
      "created_at": "2026-08-17T17:50:00.000Z"
    }
  ],
  "message": "Indent items retrieved successfully",
  "success": true
}
```

---

### 3.5 Approve Indent

- **Endpoint**: `PATCH /api/v1/indents/:id/approve`
- **Roles Required**: `admin`, `government`
- **Description**: Transitions indent status from `submitted` to `approved`.
- **Behavior**:
  - `items` array is optional.
  - If `items` is omitted, all items are approved with `quantity_approved = quantity_requested`.
  - If `items` is provided, specified items receive their explicit `quantity_approved`; unlisted items default to their `quantity_requested`.
  - Fails with `400` if any item's `quantity_approved > quantity_requested`.
  - Fails with `409` if the indent's current status is not `submitted`.

#### Request Body

```json
{
  "items": [
    {
      "id": "77777777-7777-4777-8777-777777777777",
      "quantity_approved": 400
    }
  ]
}
```

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "indent": {
      "id": "66666666-6666-4666-8666-666666666666",
      "requesting_facility_id": "22222222-2222-4222-8222-222222222222",
      "priority": "urgent",
      "status": "approved",
      "created_by": "11111111-1111-4111-8111-111111111111",
      "approved_by": "11111111-1111-4111-8111-111111111111",
      "approved_at": "2026-08-17T17:55:00.000Z",
      "updated_at": "2026-08-17T17:55:00.000Z"
    },
    "items": [
      {
        "id": "77777777-7777-4777-8777-777777777777",
        "indent_id": "66666666-6666-4666-8666-666666666666",
        "drug_id": "44444444-4444-4444-8444-444444444444",
        "quantity_requested": 500,
        "quantity_approved": 400,
        "status": "approved",
        "updated_at": "2026-08-17T17:55:00.000Z"
      }
    ]
  },
  "message": "Indent approved successfully",
  "success": true
}
```

#### Error Conditions

- `400 Bad Request`: `quantity_approved` exceeds `quantity_requested`, negative quantity, or item ID not in this indent.
- `403 Forbidden`: Non-admin/government role.
- `404 Not Found`: Indent ID not found.
- `409 Conflict`: Indent status is not `submitted` (e.g. already approved/rejected).

---

### 3.6 Reject Indent

- **Endpoint**: `PATCH /api/v1/indents/:id/reject`
- **Roles Required**: `admin`, `government`
- **Description**: Transitions indent status from `submitted` to `rejected`.

#### Request Body

```json
{
  "reason": "Requested quantities exceed historical consumption quota"
}
```

#### Response `200 OK`

```json
{
  "statusCode": 200,
  "data": {
    "id": "66666666-6666-4666-8666-666666666666",
    "requesting_facility_id": "22222222-2222-4222-8222-222222222222",
    "status": "rejected",
    "updated_at": "2026-08-17T17:55:00.000Z"
  },
  "message": "Indent rejected successfully",
  "success": true
}
```

#### Error Conditions

- `403 Forbidden`: Non-admin/government role.
- `404 Not Found`: Indent ID not found.
- `409 Conflict`: Indent status is not `submitted`.

---

## 4. Decisions Requiring Team Confirmation

1. **Shared Middleware Duplication**:
   - `identity.middleware.js` and `error.middleware.js` are currently duplicated across `requirement-server`, `supply-server`, `inventory-server`, and `consumption-server`.
   - **Recommendation**: Extract into an internal shared package (e.g. `@distrack/shared` or monorepo package) once branches merge.

2. **Cross-Service Writes on Aggregation**:
   - When `supply-server` executes `POST /supply-orders/aggregate`, it updates `indent_items.status = 'fulfilled'`. This is a cross-service write into a table owned by `requirement-server`.
   - **Status**: Documented and agreed per current microservices design; confirm if asynchronous event/message queue should be adopted in future iterations.

3. **Scoping for Non-Hospital Roles on Indents List**:
   - Currently, `hospital_staff` is strictly scoped to their own facility on `GET /indents`, while `admin`, `government`, `warehouse_staff`, and `vendor_staff` default to unscoped (view all facilities).
   - **Status**: Needs confirmation whether `warehouse_staff` or `vendor_staff` require specific facility or regional scoping.

4. **Rejection Reason Schema Field**:
   - `PATCH /indents/:id/reject` accepts an optional `reason` parameter in request body.
   - **Status**: Currently handled gracefully; if stored permanently, a `rejection_reason VARCHAR(500)` column should be added to the `indents` schema migration.

5. **Test Strategy**:
   - Testing uses `vitest` and `supertest` with mocked PostgreSQL query client (`vi.mock("../src/db/index.js")`). This guarantees zero external Supabase dependencies during automated builds.
