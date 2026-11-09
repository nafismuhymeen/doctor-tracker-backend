# Doctor Tracker API — Enterprise Healthcare Management Backend

A high-performance, modular monolith healthcare backend built with **Express 5**, **Mongoose**, **Zod 4**, and strict **TypeScript (ESM)**. Engineered with multi-role access control (RBAC), multi-tab safe refresh token rotation, partial unique indexes for race-free scheduling, immutable clinical audit logs, soft-delete cascades, and native OpenAPI 3.1 documentation.

---

## Architecture Overview

The system strictly follows a decoupled, layered modular monolith pattern. Every feature is packaged into a self-contained module where HTTP transport, domain logic, and data persistence remain strictly separated.

```
                           [ HTTP / REST Request ]
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    Express 5 Application      │
                      │  - Helmet (CSP & Security)    │
                      │  - CORS (Credential support)  │
                      │  - JSON Parser (100kb limit)  │
                      │  - Cookie Parser              │
                      │  - Rate Limiter (Auth brute)  │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │   Route Guards & Middleware   │
                      │  - authenticate (JWT verify)  │
                      │  - requireRole (RBAC matrix)  │
                      │  - validate(ZodSchema)        │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │      Controller Layer         │
                      │  - Extract HTTP req params    │
                      │  - Call Domain Service        │
                      │  - Format Standard Response   │
                      │  - (Zero DB queries here)     │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │       Service Layer           │
                      │  - Business Rules & Scoping   │
                      │  - Atomic MongoDB Sessions    │
                      │  - Soft-Delete Cascades       │
                      │  - Async Audit Trail Record   │
                      │  - Throw ApiError on failure  │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │   Schema & Persistence        │
                      │  - Zod Input & Output Schema  │
                      │  - Mongoose Model Definition  │
                      │  - Partial & Compound Indexes │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │   MongoDB Storage Engine      │
                      │  - Replica Set Transactions   │
                      │  - Standalone Fallback        │
                      │  - Covered Aggregations       │
                      └───────────────────────────────┘
```

### Module Map

```
src/modules/
├── auth/           # Authentication, JWT tokens, rotating refresh session families & reuse detection
├── users/          # User administration (admin, staff, doctor, viewer) & account activation
├── doctors/        # Doctor profiles, weekly availability schedules & doctor-level updates
├── patients/       # Patient rosters, cascading queries, soft deletes & clinical note counts
├── appointments/   # Booking lifecycle, partial unique index race prevention & rescheduling
├── visits/         # Clinical SOAP notes (Subjective, Objective, Assessment, Plan) & addendums
├── dashboard/      # Parallelized MongoDB aggregation pipelines & scoped clinician metrics
└── audit/          # Append-only immutable compliance log, actor tracking & retention TTL
```

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.x` or `v22.x` LTS
- **Yarn**: `v1.22+` or Corepack
- **MongoDB**: `v6.0+` (local standalone, replica set, or MongoDB Atlas) or **Docker**

---

### Option 1: Local Development Setup

1. **Clone and install dependencies:**
   ```bash
   cd doctor-tracker-backend
   yarn install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   *(Review and adjust `.env` values as needed — see the Environment Variables table below).*

3. **Seed demo data:**
   ```bash
   yarn seed:demo
   ```
   Populates accounts across all 4 roles (`admin`, `staff`, `doctor`, `viewer`), sample doctors, patients, appointments, visits, and audit records.

4. **Start the development server:**
   ```bash
   yarn dev
   ```
   The API server will listen on `http://localhost:5000/api/v1`.

---

### Option 2: Docker Compose Setup

Run the entire stack (MongoDB single-node replica set with transactions + containerized API) with a single command:

```bash
docker compose up --build
```

- MongoDB starts with an automated replica set initialization healthcheck (`rs0`).
- The API container waits for MongoDB healthy status, starts, and listens on `http://localhost:5000`.
- Includes automated container health checks pinging `/api/v1/health`.

To stop the stack and clean up containers:
```bash
docker compose down -v
```

---

## Environment Variables Reference

| Variable | Type | Default | Required | Purpose |
|---|---|---|---|---|
| `NODE_ENV` | `"development"` \| `"test"` \| `"production"` | `"development"` | No | Application runtime environment |
| `PORT` | `number` | `5000` | No | HTTP port for the Express application |
| `CLIENT_URL` | `string` (URL) | `http://localhost:3000` | Yes | CORS allowed origin for frontend client |
| `MONGODB_URI` | `string` (URI) | `mongodb://localhost:27017/doctor_tracker` | Yes | MongoDB connection string |
| `JWT_SECRET` | `string` (min 32 chars) | — | Yes | Secret key used to sign and verify HMAC-SHA256 JWTs |
| `ACCESS_TOKEN_TTL_MINUTES` | `number` | `15` | No | Access token expiration duration in minutes |
| `REFRESH_TOKEN_TTL_DAYS` | `number` | `7` | No | Refresh token session expiration duration in days |
| `SESSION_MAX_DAYS` | `number` | `30` | No | Maximum absolute lifetime of a session family in days |
| `REFRESH_REUSE_GRACE_SECONDS` | `number` | `10` | No | Multi-tab race window tolerance for refresh token rotation |
| `MIN_BOOKING_LEAD_MINUTES` | `number` | `15` | No | Minimum lead time before an appointment can be scheduled |
| `VISIT_EDIT_WINDOW_HOURS` | `number` | `24` | No | Window during which a clinician can edit original SOAP notes |
| `AUDIT_RETENTION_DAYS` | `number` | *(unset)* | No | Automatic TTL retention period for audit logs in days |
| `ENABLE_DOCS` | `boolean` | `true` | No | Toggles Swagger UI at `/api/docs` and OpenAPI JSON |
| `ALLOW_SEED_RESET` | `boolean` | `false` | No | Safety flag required to drop existing data before running `seed:demo` |
| `ADMIN_NAME` | `string` | `"Healthcare Admin"` | No | Display name for seeded demo admin user |
| `ADMIN_EMAIL` | `string` | `"admin@doctortracker.com"` | No | Email for seeded demo admin user |
| `ADMIN_PASSWORD` | `string` | `"AdminPassword123!"` | No | Password for seeded demo admin user |

---

## Scripts Reference

| Command | Description |
|---|---|
| `yarn dev` | Starts the Express server with live TypeScript reload using `tsx watch` |
| `yarn build` | Compiles strict TypeScript to production JavaScript in `dist/` |
| `yarn start` | Runs the compiled production server from `dist/server.js` |
| `yarn lint` | Runs ESLint 10 with typescript-eslint rules across `src/` and `tests/` |
| `yarn lint:fix` | Automatically fixes ESLint rule violations |
| `yarn format` | Runs Prettier across the entire codebase |
| `yarn typecheck` | Validates TypeScript types across the project with zero emit (`tsc --noEmit`) |
| `yarn test` | Runs the comprehensive Vitest integration test suite using MongoDB Memory Server |
| `yarn test:coverage` | Runs Vitest with v8 coverage enforcement (threshold ≥ 70% line coverage on services) |
| `yarn openapi:export` | Generates and exports the complete OpenAPI 3.1 spec to `openapi.json` |
| `yarn seed:demo` | Seeds multi-role users, practitioners, patients, appointments, visits, and audit logs |
| `yarn benchmark:dashboard` | Seeds 50,000 synthetic patient records and measures MongoDB aggregation performance |

---

## API Documentation & Observability

### Interactive Documentation (Swagger UI)
When `ENABLE_DOCS=true` (default), interactive API documentation is available at:
- **Swagger UI:** `http://localhost:5000/api/docs`
- **OpenAPI 3.1 Spec:** `http://localhost:5000/api/openapi.json`

To generate a standalone spec file:
```bash
yarn openapi:export
```

### Health & Readiness Probes

- **Liveness Probe:** `GET /api/v1/health`
  - Returns `200 OK` with uptime, timestamp, and process status.
  - Used by container orchestrators to verify container liveness.
- **Readiness Probe:** `GET /api/v1/ready`
  - Performs an active `db.admin().ping()` against MongoDB.
  - Returns `200 OK` when connected and responding.
  - Returns `503 Service Unavailable` if MongoDB connection drops.

### Standard Response Envelope

All API responses follow a predictable JSON envelope structure:

**Success Response:**
```json
{
  "success": true,
  "message": "Resource retrieved successfully",
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Human-readable explanation of error",
  "code": "MACHINE_READABLE_ERROR_CODE",
  "errors": [
    { "field": "email", "message": "Invalid email address format" }
  ]
}
```

---

## Role-Based Access Control (RBAC) Matrix

Doctor Tracker enforces strict principle-of-least-privilege authorization. The system defines 4 distinct roles:

- **`admin`**: Full system administration, user management, and audit log inspection.
- **`staff`**: Receptionists and intake staff; manages appointments, patients, and doctor directories.
- **`doctor`**: Clinical practitioners; strictly isolated to their own assigned patients, appointments, and clinical SOAP notes.
- **`viewer`**: Read-only stakeholder; can view statistics, doctor directories, and patient rosters without mutation rights.

> **Doctor Scoping (`own`):** When a user with the `doctor` role accesses an appointment, patient, or visit not linked to their assigned `doctorId`, the server responds with **404 Not Found** (rather than 403 Forbidden) to eliminate resource enumeration vectors.

| Endpoint Group | admin | staff | doctor | viewer |
|---|:---:|:---:|:---:|:---:|
| **Auth** (session, `/me`, password change) | ✓ | ✓ | ✓ | ✓ |
| **Users Management** (`/api/v1/users`) | ✓ | ✗ | ✗ | ✗ |
| **Doctors**: List / Read / Availability | ✓ | ✓ | ✓ | ✓ |
| **Doctors**: Create / Delete | ✓ | ✗ | ✗ | ✗ |
| **Doctors**: Update Profile | ✓ | ✗ | `own` (schedule only) | ✗ |
| **Patients**: List / Read | ✓ | ✓ | `own` | ✓ |
| **Patients**: Create / Update | ✓ | ✓ | `own` | ✗ |
| **Patients**: Delete (Soft) | ✓ | ✓ | ✗ | ✗ |
| **Dashboard**: Stats (`/dashboard/stats`) | ✓ | ✓ | ✗ | ✓ |
| **Dashboard**: Appointments Breakdown | ✓ | ✓ | `own` (scoped) | ✓ |
| **Appointments**: List / Read | ✓ | ✓ | `own` | ✓ |
| **Appointments**: Create / Status / Reschedule | ✓ | ✓ | `own` | ✗ |
| **Visits**: Read Clinical Notes | ✓ | ✗ | `own` | ✗ |
| **Visits**: Create / Edit (24h) / Addendum | ✗ | ✗ | `own` | ✗ |
| **Audit Logs** (`/api/v1/audit`) | ✓ | ✗ | ✗ | ✗ |

*Legend: `✓` = Allowed; `✗` = 403 Forbidden; `own` = Restricted to clinician's own `doctorId` (out-of-scope returns 404).*

---

## Technical Decisions

### 1. Partial Unique Indexes for Race-Free Scheduling
- **Problem:** When two concurrent requests attempt to book the exact same doctor time slot simultaneously, traditional application-level validation ("find existing booking then insert if empty") suffers from Time-Of-Check to Time-Of-Use (TOCTOU) race conditions.
- **Solution:** We enforced scheduling exclusivity directly at the database tier using a **Mongoose partial unique compound index**:
  ```typescript
  AppointmentSchema.index(
    { doctorId: 1, appointmentDate: 1, slot: 1 },
    {
      unique: true,
      partialFilterExpression: { status: { $in: ["pending", "confirmed"] } },
      name: "unique_scheduled_doctor_slot",
    }
  );
  ```
- **Result:** Concurrent booking collisions trigger a MongoDB `E11000` duplicate key violation, which the service layer catches and maps to an explicit `409 Conflict` (`SLOT_ALREADY_BOOKED`). Cancelled appointments are naturally excluded by the partial filter, allowing the slot to be immediately re-booked.

### 2. Rotating Refresh Tokens with Multi-Tab Grace Window
- **Problem:** Long-lived static access tokens are vulnerable to exfiltration. Rotating refresh tokens mitigates this, but immediate token invalidation causes race conditions when a user opens multiple browser tabs that refresh their sessions simultaneously.
- **Solution:** We implemented family-based refresh token rotation in `AuthService` with an explicit **10-second grace window** (`REFRESH_REUSE_GRACE_SECONDS`):
  1. Each successful login creates a `SessionFamily` record with a cryptographically hashed token.
  2. When a refresh token is exchanged, it is marked as `isUsed: true` with a `rotatedAt` timestamp, and a new child token is issued.
  3. If another tab presents the previous token within 10 seconds of rotation, the server returns `409 TOKEN_ROTATED`, signaling the client to reuse the freshly established cookie rather than terminating the session.
  4. If a used token is presented *outside* the grace window, theft is assumed: the entire session family is instantly revoked (`401 SESSION_TERMINATED`).

### 3. Append-Only Audit Logging with Zero PHI Leaks
- **Problem:** Regulatory standards require non-repudiable audit logging for patient data access and administrative operations without degrading request latency or storing Protected Health Information (PHI) in plaintext logs.
- **Solution:**
  - **Immutability:** The `AuditLog` schema enforces `strict: "throw"` with no update or delete routes exposed.
  - **Non-blocking Resilience:** Domain services invoke `auditService.record()` asynchronously in a fire-and-forget or awaited best-effort fashion. Any audit storage error is trapped and logged via Pino without failing the primary user transaction.
  - **Zero PHI Redaction:** Field changes automatically redact sensitive patient fields (`name`, `phone`, `email`, `medicalHistory`, `passwordHash`, `chiefComplaint`, `assessment`) into `"[redacted]"`, preserving change lineage without persisting confidential medical records.

### 4. Soft Deletes and Standalone-Resilient Atomic Transactions
- **Problem:** Healthcare records must not be permanently deleted on casual deletion requests. Furthermore, multi-document mutations (e.g., patient deletion cascading to pending appointment cancellations and audit records) require atomic consistency, but local development environments frequently run standalone MongoDB instances without replica sets.
- **Solution:**
  - **Soft Deletes:** Patient models utilize `isDeleted: true` and `deletedAt` timestamps. Lookups automatically exclude soft-deleted records, and cascading operations cancel associated upcoming appointments.
  - **Transaction Utility:** `src/utils/transaction.ts` inspects the active MongoDB connection. If a replica set is active, mutations run inside a managed multi-document MongoDB transaction (`session.withTransaction()`). If running on a standalone developer instance, operations proceed with non-transactional fallback without throwing `Transaction numbers are only allowed on a replica set member`.

### 5. Modular Monolith Architecture
- **Problem:** Microservices introduce operational complexity, network latency, distributed transaction challenges, and deployment overhead that are unnecessary for unified healthcare administrative portals.
- **Solution:** We structured the backend as a strictly bounded modular monolith:
  - Controllers contain zero database queries, purely validating requests and translating service exceptions into standard HTTP responses.
  - Services communicate via clear interfaces and share database connection pools.
  - This architecture delivers high developer velocity, sub-millisecond inter-module communication, and single-container deployments while maintaining clean boundaries that can be extracted into microservices if scaling demands dictate.

### 6. Native Zod 4 OpenAPI Specification Generation
- **Problem:** Maintaining a separate `openapi.yaml` file quickly leads to schema drift between the actual code and documentation. Third-party OpenAPI decorators often bloat controller classes with repetitive annotations.
- **Solution:** We leveraged Zod 4's native `z.toJSONSchema()` capability in `src/docs/openapi.ts`. By passing custom unrepresentable schema handlers for dates and coercions, our existing request validation schemas directly generate the 100% compliant OpenAPI 3.1 specification served at `/api/openapi.json` and rendered interactively by Swagger UI at `/api/docs`.

---

## Performance Benchmarks

To verify performance under realistic enterprise data volume, we executed the automated benchmark suite (`yarn benchmark:dashboard`) on an isolated dataset containing **50,000 synthetic patient records** distributed across 10 active practitioners.

### Measured Results

```
==================================================
   DASHBOARD 50K PATIENT BENCHMARK (Phase 5.5)   
==================================================

Total Patients Seeded:   50,000 records (batch insertion: ~2.34s)
Iterations:              5 consecutive aggregation runs
Average Latency:         49.29 ms
Min Latency:             48.48 ms
Max Latency:             50.11 ms
Server Execution Time:   63 ms
Total Docs Examined:     0 (100% index-covered execution)
Documents Returned:      30 aggregated buckets
```

### Analysis
The dashboard aggregation pipeline utilizes compound indexes on `{ doctorId: 1, isDeleted: 1 }` and `{ createdAt: 1 }`. MongoDB satisfies the facet aggregations directly from the B-tree index keys without scanning unindexed document bodies (`totalDocsExamined: 0`), keeping latency consistently under 50ms even with 50,000 patient records.

---

## Limitations & Future Roadmap

- **HIPAA Disclaimer:** This software is an administrative demonstration platform. It does not constitute a certified HIPAA-compliant Electronic Health Record (EHR) system out of the box. Production healthcare deployments require formal HIPAA/HITECH risk assessments, Business Associate Agreements (BAAs), database encryption-at-rest, centralized key management (KMS), and physical access controls.
- **Synthetic Data:** All seeded clinicians, patients, contact numbers, and clinical SOAP notes are entirely synthetic and generated for demonstration purposes.
- **Future Enhancements:**
  - Real-time WebSocket notifications for doctor schedule updates and appointment status changes.
  - Redis caching layer for read-heavy dashboard metric endpoints.
  - Sharding support for high-throughput multi-hospital deployments.

---

## License

This project is licensed under the MIT License.
