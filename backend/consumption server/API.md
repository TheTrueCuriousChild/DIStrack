# Consumption Server API Specification

Consumption Server (Server 2) is a microservice responsible for recording and querying drug consumption within the DIStrack system. It operates on a shared PostgreSQL database alongside the Inventory Server.

---

## 1. System & Authentication Architecture

Authentication is owned by the Main/Auth server. The Consumption Server does not perform login, registration, or JWT generation. Instead, upstream gateways/servers forward identity context via HTTP headers:

| Header          | Type | Description                                                                |
| --------------- | ---- | -------------------------------------------------------------------------- |
| `x-user-id`     | UUID | Authenticated user ID                                                      |
| `x-user-role`   | Enum | `admin`, `government`, `hospital_staff`, `warehouse_staff`, `vendor_staff` |
| `x-facility-id` | UUID | Facility associated with the user                                          |

### Authorization Scopes

- **`admin` / `government`**: Global access (can record and query consumption across any facility).
- **`hospital_staff`**: Scoped strictly to their own facility (`x-facility-id`).
- **`warehouse_staff`**: Scoped to their own facility and child facilities in the hierarchy (`facilities.parent_facility_id`).
- **`vendor_staff`**: Forbidden (`403 Forbidden`) from consumption operations.

---

## 2. Response & Error Envelopes

### Standard Success Envelope (`ApiResponse`)

```json
{
  "statusCode": 200,
  "data": {},
  "message": "Operation description",
  "success": true
}
```

### Paginated List Envelope

```json
{
  "statusCode": 200,
  "data": {
    "data": [],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 100
    }
  },
  "message": "Consumption records fetched successfully",
  "success": true
}
```

### Standard Error Envelope (`ApiError`)

```json
{
  "statusCode": 400,
  "data": null,
  "message": "Error description message",
  "success": false,
  "errors": []
}
```

---

## 3. Endpoints

### 1. Health Check

`GET /health` (Unauthenticated)

**Response `200 OK`**:

```json
{
  "statusCode": 200,
  "data": { "status": "ok" },
  "message": "Health check done!",
  "success": true
}
```

---

### 2. Record Consumption

`POST /api/v1/consumption`

Records drug consumption at a facility, checks stock availability atomically, inserts a negative entry into `stock_ledger`, and refreshes `stock_summary`.

**Request Body**:

```json
{
  "facility_id": "00000000-0000-4000-8000-000000000002",
  "batch_id": "00000000-0000-4000-8000-000000000004",
  "drug_id": "00000000-0000-4000-8000-000000000005",
  "quantity": 25,
  "consumed_at": "2026-08-17T12:00:00.000Z"
}
```

_Note: `consumed_at` is optional and defaults to `CURRENT_TIMESTAMP`. `recorded_by` is populated automatically from `x-user-id`._

**Response `201 Created`**:

```json
{
  "statusCode": 201,
  "data": {
    "id": "00000000-0000-4000-8000-000000000010",
    "facility_id": "00000000-0000-4000-8000-000000000002",
    "batch_id": "00000000-0000-4000-8000-000000000004",
    "drug_id": "00000000-0000-4000-8000-000000000005",
    "quantity": 25,
    "recorded_by": "00000000-0000-4000-8000-000000000001",
    "consumed_at": "2026-08-17T12:00:00.000Z"
  },
  "message": "Consumption recorded successfully",
  "success": true
}
```

**Status Codes**:

- `201 Created`: Successfully recorded.
- `400 Bad Request`: Validation failure or batch/drug mismatch.
- `401 Unauthorized`: Missing or invalid identity headers.
- `403 Forbidden`: Unauthorized role or out-of-scope facility.
- `404 Not Found`: Batch not found.
- `409 Conflict`: Insufficient stock available in `stock_ledger`.
- `500 Internal Server Error`: Database error; transaction rolled back.

---

### 3. List Consumption Records

`GET /api/v1/consumption`

**Query Parameters**:

- `facility_id` (UUID, optional): Filter by facility.
- `batch_id` (UUID, optional): Filter by batch.
- `drug_id` (UUID, optional): Filter by drug.
- `from_date` (YYYY-MM-DD, optional): Filter by start date.
- `to_date` (YYYY-MM-DD, optional): Filter by end date.
- `page` (Integer, default `1`, min `1`).
- `limit` (Integer, default `20`, min `1`, max `100`).

**Response `200 OK`**:

```json
{
  "statusCode": 200,
  "data": {
    "data": [
      {
        "id": "00000000-0000-4000-8000-000000000010",
        "facility_id": "00000000-0000-4000-8000-000000000002",
        "batch_id": "00000000-0000-4000-8000-000000000004",
        "drug_id": "00000000-0000-4000-8000-000000000005",
        "quantity": 25,
        "recorded_by": "00000000-0000-4000-8000-000000000001",
        "consumed_at": "2026-08-17T12:00:00.000Z",
        "drug_name": "Amoxicillin",
        "drug_unit": "capsule",
        "batch_no": "B-2026-AMOX",
        "expiry_date": "2027-06-30"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  },
  "message": "Consumption records fetched successfully",
  "success": true
}
```

---

### 4. Get Consumption Record by ID

`GET /api/v1/consumption/:id`

**Path Parameters**:

- `id` (UUID, required): The consumption record UUID.

**Response `200 OK`**:

```json
{
  "statusCode": 200,
  "data": {
    "id": "00000000-0000-4000-8000-000000000010",
    "facility_id": "00000000-0000-4000-8000-000000000002",
    "batch_id": "00000000-0000-4000-8000-000000000004",
    "drug_id": "00000000-0000-4000-8000-000000000005",
    "quantity": 25,
    "recorded_by": "00000000-0000-4000-8000-000000000001",
    "consumed_at": "2026-08-17T12:00:00.000Z",
    "drug_name": "Amoxicillin",
    "drug_unit": "capsule",
    "batch_no": "B-2026-AMOX",
    "expiry_date": "2027-06-30"
  },
  "message": "Consumption record fetched successfully",
  "success": true
}
```

**Status Codes**:

- `200 OK`: Found and returned.
- `400 Bad Request`: Invalid UUID format.
- `401 Unauthorized`: Missing or invalid identity.
- `403 Forbidden`: User facility does not have permission to view record.
- `404 Not Found`: Record does not exist.

---

## 4. Implementation Decisions & Defaults

1. **Concurrency Serialization & Stock Safety**:
   - During `POST /api/v1/consumption`, the database row for the batch is locked with `SELECT id, drug_id FROM batches WHERE id = $1 FOR UPDATE`. This serializes concurrent transactions touching the same batch across microservices sharing PostgreSQL.
   - Available stock is calculated authoritatively in real-time from `stock_ledger` via `SELECT COALESCE(SUM(quantity), 0)::int WHERE facility_id = $1 AND batch_id = $2`.
   - If `available_stock < quantity`, the transaction is rolled back and returns `409 Conflict`.
2. **Append-Only Stock Ledger**:
   - Consumption movements are inserted into `stock_ledger` with negative quantity (`-quantity`), `txn_type = 'consumption'`, and `reference_type = 'consumption'`. No rows are updated or deleted.
3. **Materialized View Refresh**:
   - `stock_summary` is refreshed inside the mutation transaction client using `REFRESH MATERIALIZED VIEW stock_summary`. If the refresh fails, the entire transaction rolls back.
4. **Facility Scoping**:
   - `hospital_staff` without an explicit `facility_id` query param default to their own facility (`x-facility-id`). If they provide a `facility_id` different from their own, a `403 Forbidden` is returned.
