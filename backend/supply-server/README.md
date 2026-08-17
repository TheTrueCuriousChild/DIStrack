# DIStrack Supply Server

Microservice responsible for vendor management, supply order aggregation, and shipment lifecycle tracking in the DIStrack national drug supply chain management system.

## Tech Stack

- Node.js (ES Modules)
- Express 5
- `pg` (Raw parameterized PostgreSQL queries)
- `zod` (Request schema validation)
- `dotenv` (Configuration)
- `vitest` + `supertest` (Testing)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Update `DATABASE_URL` with your PostgreSQL / Supabase connection string.

### 3. Run Development Server

```bash
npm run dev
```

### 4. Run Tests

```bash
npm run test
```

### 5. Code Quality

```bash
npm run lint
npm run format
```

## API Documentation

See [API.md](./API.md) for full endpoint specifications, role permissions, request/response examples, and architectural decisions requiring team confirmation.
