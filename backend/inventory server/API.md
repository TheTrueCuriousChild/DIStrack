# Inventory Server API

This document is the implementation contract for `inventory-server`. It is extracted from the team-approved Inventory + Consumption API design and applies to the service at the assumed base path `/api/v1`.

## Conventions

- Requests and JSON responses use `application/json`.
- IDs are UUID v4 strings. Timestamps are ISO 8601 UTC strings.
- Every route except `GET /health` requires identity context forwarded by `auth-server`:
  - `x-user-id`: UUID
  - `x-user-role`: `admin`, `government`, `hospital_staff`, `vendor_staff`, or `warehouse_staff`
  - `x-facility-id`: UUID for the user's facility
- Missing or invalid identity headers return `401`; role or facility scope violations return `403`.
- `hospital_staff` and `warehouse_staff` are scoped to their own facility; warehouse staff may also act on child facilities in the `parent_facility_id` tree. `admin` and `government` are unscoped.
- Successful responses use `ApiResponse`: `{ "statusCode": 200, "data": {}, "message": "Success", "success": true }`. Paginated data is placed in `data` as `{ "data": [], "meta": { "page": 1, "limit": 20, "total": 0 } }`.
- Errors use `ApiError`: `{ "statusCode": 400, "data": null, "message": "...", "success": false, "errors": [] }`.
- Standard statuses: `200`, `201`, `400`, `401`, `403`, `404`, `409`, `500`.
- Paginated endpoints default to `page=1` and `limit=20`; `limit` must not exceed `100`.
- `stock_ledger` is append-only. Inventory actions may insert ledger records but must never update or delete them.

## Drugs

### `GET /drugs`

Lists drugs. Optional query parameters: `category`, `active` (boolean), `page`, `limit`.

Response `200`:

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Paracetamol",
      "category": "analgesic",
      "unit": "tablet",
      "storage_condition": "room temperature",
      "active": true
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 42 }
}
```

### `POST /drugs`

Roles: `admin`, `government`.

```json
{
  "name": "Paracetamol",
  "category": "analgesic",
  "unit": "tablet",
  "storage_condition": "room temperature"
}
```

`name` and `unit` are required. Returns `201` and the created drug. Returns `400` if either required field is missing.

### `GET /drugs/:id`

Returns `200` with the drug, or `404`.

### `PATCH /drugs/:id`

Roles: `admin`, `government`. Accepts any subset of `name`, `category`, `unit`, `storage_condition`, and `active`. Returns `200` with the updated drug.

## Batches

### `GET /batches`

Lists batches, including joined `drug_name`. Optional query parameters: `drug_id`, `expiring_before` (`YYYY-MM-DD`), `page`, `limit`.

### `POST /batches`

Roles: `admin`, `warehouse_staff`.

```json
{
  "drug_id": "uuid",
  "batch_no": "B2026-0142",
  "manufacturer": "XYZ Pharma",
  "manufacturing_date": "2026-01-10",
  "expiry_date": "2027-01-10"
}
```

`drug_id`, `batch_no`, and `expiry_date` are required. The server generates `qr_code`. Returns `201` with the created batch or `409` when `(drug_id, batch_no)` already exists.

### `GET /batches/:id`

Returns `200` with the batch, or `404`.

### `GET /batches/:qr_code`

Looks up a scanned QR code. Returns `200` with the batch joined with drug details, or `404`.

> Route matching must distinguish UUID batch IDs from QR code values.

### `GET /batches/:id/qr-image`

Renders an `image/png` QR image on demand from the batch `qr_code`; QR images are not stored.

## Receipts

### `POST /receipts`

Roles: `warehouse_staff`, `hospital_staff`; scope is the user's `receiving_facility_id`.

```json
{
  "shipment_id": "uuid",
  "receiving_facility_id": "uuid",
  "status": "complete",
  "notes": "optional text",
  "items": [
    {
      "drug_id": "uuid",
      "batch_id": "uuid or null",
      "batch_no": "B2026-0142",
      "manufacturer": "XYZ Pharma",
      "manufacturing_date": "2026-01-10",
      "expiry_date": "2027-01-10",
      "quantity_received": 500,
      "quantity_damaged": 5
    }
  ]
}
```

`shipment_id`, `receiving_facility_id`, and `items` are required. Every item requires `drug_id`, `quantity_received`, and either `batch_id` or sufficient batch details to create a batch (`batch_no` and `expiry_date`). `status` defaults to `complete`.

For each item, resolve or create the batch, create `receipt_items`, then append a `stock_ledger` record: `txn_type=receipt`, `quantity=quantity_received-quantity_damaged`, `reference_type=receipt`, and `reference_id=receipt.id`.

Returns `201` with the receipt and its items. Returns `400` for unresolved batch data and `404` for an unknown shipment.

### `GET /receipts/:id`

Returns `200` with receipt and items, or `404`.

## Stock

### `GET /facilities/:id/stock`

Returns current stock derived from `stock_summary`. Optional query parameters: `batch_id`, `drug_id`, `low_stock_only` (boolean).

```json
{
  "data": [
    {
      "batch_id": "uuid",
      "drug_id": "uuid",
      "drug_name": "Paracetamol",
      "batch_no": "B2026-0142",
      "expiry_date": "2027-01-10",
      "quantity_on_hand": 340
    }
  ]
}
```

### `GET /facilities/:id/ledger`

Returns a paginated raw ledger audit history. Optional query parameters: `batch_id`, `txn_type`, `from_date`, `to_date`, `page`, `limit`.

## Transfers

### `POST /transfers`

Roles: `warehouse_staff`, `hospital_staff`, `admin`, `government`.

```json
{
  "from_facility_id": "uuid",
  "to_facility_id": "uuid",
  "batch_id": "uuid",
  "quantity": 100,
  "reason": "manual"
}
```

Returns `201` with a `pending` transfer.

### `GET /transfers/suggestions`

Returns rule-based redistribution candidates among facilities with the same parent. Requires `parent_facility_id`.

### `GET /transfers`

Optional query parameters: `facility_id`, `status`, `page`, `limit`.

### `GET /transfers/:id`

Returns `200` with a transfer or `404`.

### `POST /transfers/:id/approve`

Roles: `warehouse_staff`, `admin`, `government`. Transitions `pending` to `in_transit`, then appends a negative source `transfer_out` ledger row. Returns `200`; returns `409` unless status is `pending`.

### `POST /transfers/:id/receive`

Restricted to staff at `to_facility_id`. Transitions `in_transit` to `completed`, then appends a positive destination `transfer_in` ledger row. Returns `200`; returns `409` unless status is `in_transit`.

### `POST /transfers/:id/cancel`

Returns `200` with `status=cancelled`. Returns `409` if the transfer is already completed.

## Wastage

### `POST /wastage`

Roles: `warehouse_staff`, `hospital_staff`.

```json
{
  "facility_id": "uuid",
  "batch_id": "uuid",
  "quantity": 20,
  "reason": "expired"
}
```

`reason` is `expired`, `damaged`, or `other`. Creates the wastage record, then appends a negative `wastage` ledger row with `reference_type=wastage` and `reference_id=wastage.id`. Returns `201` with the wastage record.

### `GET /wastage`

Optional query parameters: `facility_id`, `batch_id`, `from_date`, `to_date`, `page`, `limit`.

## Alerts

### `GET /alerts`

Optional query parameters: `facility_id`, `type` (`low_stock` or `expiry`), `severity`, `status`, `page`, `limit`. Returns a paginated alert list.

### `PATCH /alerts/:id`

Accepts `{ "status": "acknowledged" }` or `{ "status": "resolved" }`. Returns the updated alert and sets `resolved_at` when resolving it.

## Health

### `GET /health`

No authentication required. Returns `200`:

```json
{ "statusCode": 200, "data": { "status": "ok" }, "message": "Health check done!", "success": true }
```

## Implementation Decisions & Defaults

- **Low-Stock Threshold**: Default threshold is `quantity_on_hand < 20` across stock filters and alert checks.
- **UUID vs. QR Disambiguation**: Route parameters matching standard UUID v4 format (`/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`) query by `batches.id`, whereas non-UUID strings query by `batches.qr_code`.
- **Transfer Suggestion Rules**: Identifies redistribution opportunities among sibling facilities sharing `parent_facility_id`, selecting batches expiring within 30 days where source `quantity_on_hand >= 100` and destination `quantity_on_hand < 20`.
- **Stock Summary Refresh**: The `stock_summary` materialized view is refreshed automatically following all ledger mutations (`receipt`, `transfer_out`, `transfer_in`, `wastage`).
- **Identity & Authorization**: Forwarded identity headers (`x-user-id`, `x-user-role`, `x-facility-id`) are strictly enforced; facility scoping allows `admin`/`government` full access, `hospital_staff` own-facility access, and `warehouse_staff` access to own and child facilities.
- **Receipt Batch Inline Creation**: Items in `POST /receipts` without a `batch_id` create new batches inline using `(drug_id, batch_no)` or resolve existing ones idempotently.
