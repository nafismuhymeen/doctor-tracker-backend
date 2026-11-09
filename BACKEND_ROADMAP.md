# Doctor Tracker Backend: Implementation Roadmap (Phases 1–5)

This file is the single source of truth for the next stage of the **backend only** (`doctor-tracker-backend`).
Do **not** modify the frontend repository. A separate frontend roadmap will follow once the API is finished.

---

## 0. How to work with this file

1. Read this entire file before doing anything.
2. Work on **one phase at a time**, and only the phase the user names. Never start the next phase on your own.
3. For every phase, in this order:
   1. Reply with a **plan** (files to create/change, new dependencies, schema changes, risks). **Stop and wait for approval.**
   2. After approval, implement. Follow the steps in the order given.
   3. Run `yarn typecheck` and `yarn test` (once the test setup exists). Fix every failure.
   4. Append the phase's endpoints to `docs/api-changelog.md` (create it in Phase 1) using the template in Appendix C. The frontend phase will be built from this file.
   5. Reply with: files changed, new endpoints, new env vars, any deviations from this document and why, and anything you could not finish.
4. If something in this file conflicts with the actual code, **stop and ask** instead of guessing. If you make a judgment call, state it explicitly in your summary.
5. After each phase, tick its row in the Status table at the bottom of this file. Do not edit anything else in this file.

---

## 1. Context and global conventions

### Current stack
Express 5, Mongoose 9, Zod 4, TypeScript (strict, ESM: imports use a `.js` suffix), bcrypt, jsonwebtoken, helmet, cors, cookie-parser, pino/pino-http, express-rate-limit.
Modules live in `src/modules/<name>/` as `*.routes.ts → *.controller.ts → *.service.ts`, with `*.schema.ts` (Zod) and `*.model.ts` (Mongoose).

### Preconditions (verify first; if any is missing, stop and tell the user)
The "Prompt 0 hardening" work must already be done:
- `src/config/env.ts` exists (Zod-validated env, fail-fast) and everything reads config from it, not from `process.env`.
- Doctors support PATCH and soft delete. **Check which soft-delete field was used** (expected: `isDeleted: boolean`, default `false`). Use the *same convention* for every new soft-deletable model.
- `escapeRegex` util exists and is used in all `$regex` filters.
- Rate limiting, request-id and pino-http (with cookie/authorization redaction) exist; `trust proxy` is configurable.
- A transaction helper exists. If not, create `src/utils/with-transaction.ts`: runs a callback inside a Mongoose session transaction, and falls back to running without a transaction (logging a warning once) if the server is a standalone Mongo that doesn't support transactions.

### Global conventions (apply to all phases)
- **Response envelope (unchanged):** success `{ success: true, message?, data? }`; error `{ success: false, message, errors? }`. Do not break existing response shapes or existing endpoint paths unless this file says so.
- **Pagination:** same shape as existing: `pagination: { currentPage, limit, total<Entity>, totalPages, hasNextPage, hasPreviousPage }` (e.g. `totalAppointments`).
- **Validation:** all input (body, query, params) validated with Zod in the module's `*.schema.ts`. Validate ObjectIds. Never trust the client for ownership fields.
- **Dates:** store UTC `Date`; accept/return ISO-8601 strings. Business-day logic uses the doctor's timezone (Phase 2).
- **Errors:** throw `ApiError`. Statuses: 400 validation, 401 unauthenticated, 403 forbidden (role), 404 not found *or out of scope*, 409 conflict. Out-of-scope resources (e.g. a doctor requesting another doctor's patient) return **404**, not 403, so existence is not leaked. List endpoints silently filter to scope.
- **Machine-readable error codes:** see step 1.1.
- **Security:** never log or store passwords, password hashes, tokens or cookies. No secrets in the repo. Demo/seed data is synthetic only.
- **Tests:** every new endpoint ships with tests in the same phase (setup in step 1.0).
- **Code style:** keep controllers thin (parse → call service → respond). Business rules live in services. No DB access in controllers.

---

# Phase 1: Users, RBAC and sessions

Goal: replace the single `Admin` with role-based users, short-lived access tokens, rotating refresh tokens, and per-role authorization.

### 1.0 Test infrastructure (do this first)
- Add dev deps: `vitest`, `supertest`, `@types/supertest`, `mongodb-memory-server`.
- Use `MongoMemoryReplSet` (single node replica set) so transactions work in tests.
- `vitest.config.ts`: node environment, `setupFiles`, `pool: "forks"`, coverage via v8.
- Test helpers in `tests/helpers/`: `startTestDb()/stopTestDb()/clearDb()`, user factory, `loginAs(role)` returning a Supertest agent that keeps cookies, doctor/patient factories.
- Scripts: `test`, `test:watch`, `test:coverage`.
- Ensure `app.ts` exports `app` without calling `listen` (already true). Ensure Mongoose indexes are built before tests run (`await Model.init()` / `syncIndexes`), since several features rely on unique indexes.
- Add a smoke test (health endpoint) to prove the setup works.

### 1.1 Machine-readable error codes
- Add an optional `code?: string` to `ApiError` (constructor stays backward compatible).
- The error handler includes `code` in the JSON response when present.
- Codes introduced in this roadmap: `TOKEN_ROTATED`, `SESSION_REVOKED`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `SLOT_TAKEN`, `PATIENT_DOUBLE_BOOKED`, `OUTSIDE_WORKING_HOURS`, `INVALID_STATUS_TRANSITION`, `DOCTOR_HAS_APPOINTMENTS`, `EDIT_WINDOW_EXPIRED`, `LAST_ADMIN`.

### 1.2 User model (replaces Admin)
`src/modules/users/user.model.ts`:
- `name`, `email` (unique, lowercase, trimmed), `passwordHash` (`select: false`), `role: "admin" | "staff" | "doctor" | "viewer"`, `doctorId?` (ref Doctor), `isActive` (default true), `tokenVersion` (number, default 0), `lastLoginAt?`, timestamps.
- `doctorId` is **required iff role = "doctor"**, must reference an active (non-deleted) doctor, and must be unique across users (partial unique index where role is doctor).
- `viewer` = read-only role used for the public demo account.
- Password policy (Zod, shared): 10–72 characters (bcrypt truncates at 72 bytes), at least one letter and one digit.
- **Migration:** `src/scripts/migrate-admins-to-users.ts`. Idempotent: copies every `admins` document into `users` with `role: "admin"`, preserving `_id`, `name`, `email`, `passwordHash`, `isActive`. Does not delete the old collection. Add script `migrate:users`.
- Update `seed-admin.ts` to create an admin **User**. Update `seed-data.ts` to also create (only if the env vars are set, never hardcoded): a `staff` user, a `doctor` user linked to the first seeded doctor, and a `viewer` user. Add optional env vars (Appendix B).
- Remove the `Admin` model once nothing references it. Update `src/types/express/index.d.ts`: replace `req.adminId` with `req.user: { id: string; role: Role; doctorId?: string }`.

### 1.3 Tokens and sessions
**Access token:** JWT, 15 min (`ACCESS_TOKEN_TTL_MINUTES`), payload `{ sub, tv }` (`tv` = user's `tokenVersion`). Sent as httpOnly cookie `accessToken`. The `Authorization: Bearer` fallback stays (useful for Swagger/Postman).

**Refresh token:** opaque random value (`crypto.randomBytes(48)`, base64url). Store only its **SHA-256 hash**.
`Session` model (`src/modules/auth/session.model.ts`):
`userId`, `familyId`, `tokenHash` (unique), `expiresAt`, `familyExpiresAt` (absolute cap, `SESSION_MAX_DAYS`, default 30), `revokedAt?`, `replacedByHash?`, `userAgent`, `ip`, timestamps. TTL index on `expiresAt`.
Sent as httpOnly cookie `refreshToken` with `path: "/api/v1/auth"`; lifetime `REFRESH_TOKEN_TTL_DAYS` (default 7), never beyond `familyExpiresAt`. Cookie `sameSite`/`secure` come from the existing env-driven cookie config (separate options for access vs refresh).

**Rotation (`POST /auth/refresh`):**
1. Hash the cookie value, find the session. Missing → 401 `SESSION_REVOKED`.
2. If found, not revoked, not expired → revoke it (`revokedAt`, `replacedByHash`), create a new session in the **same family**, set both cookies, return 200.
3. If found but **already revoked** (token reuse):
   - If it was revoked less than `REFRESH_REUSE_GRACE_SECONDS` ago (default 10), treat as a benign multi-tab race: respond **409 `TOKEN_ROTATED`** without revoking anything (the client retries; the cookie jar already has the new token).
   - Otherwise treat as theft: **revoke the entire family** and respond 401 `SESSION_REVOKED`. (Audit hook added in Phase 4.)
4. Expired or user inactive or `tokenVersion` mismatch → 401.

**Authenticate middleware** (`src/middleware/authenticate.ts`, replaces `authenticate-admin.ts`; update all imports): verify the access JWT, load the user, reject if missing / inactive (403 `ACCOUNT_DISABLED`) / `tv` mismatch (401). Set `req.user` from the **database record**, never from token claims.

**Login hardening:** if the email is not found, still run `bcrypt.compare` against a constant dummy hash so timing does not reveal account existence. Generic message and `INVALID_CREDENTIALS` code for any credential failure. Update `lastLoginAt`.

**Endpoints (`/api/v1/auth`):**
- `POST /login` (existing strict rate limiter; response now includes `user: { id, name, email, role, doctorId? }`; sets both cookies)
- `POST /refresh` (light rate limiter)
- `POST /logout` (revokes the current session, clears both cookies; idempotent)
- `POST /logout-all` (authenticated; revokes all of the user's sessions)
- `GET /me` (returns `user` including `role` and `doctorId`)
- `PATCH /password` (authenticated; requires `currentPassword`, `newPassword`; increments `tokenVersion`, revokes all sessions, then issues a fresh session for the current device)

### 1.4 Authorization
- `requireRole(...roles)` middleware (`src/middleware/require-role.ts`).
- A scope helper used by services, e.g. `scopeFor(user)` → `{ doctorId?: ObjectId }`. Doctors are restricted to their own `doctorId`; all other roles are unrestricted.
- Apply the **permission matrix in Appendix A** to every existing route (`/doctors`, `/patients`, `/doctors/:doctorId/patients`, `/dashboard`). Existing endpoints must keep working for `admin`.
- Doctor-role users may `PATCH /doctors/:id` only on their **own** doctor record and only the schedule fields (`workingHours`, `slotMinutes`, added in Phase 2). Until Phase 2, doctors cannot PATCH doctors.
- The dashboard stats endpoint is forbidden for the `doctor` role (a doctor-scoped dashboard arrives in Phase 2).

### 1.5 User management (admin only), `/api/v1/users`
- `GET /` (paginated; filters: `role`, `isActive`, `search`)
- `POST /` (create user with role; `doctor` role requires `doctorId`)
- `PATCH /:id` (`name`, `role`, `isActive`, `doctorId`). Changing role or deactivating increments `tokenVersion` and revokes sessions.
- `POST /:id/reset-password` (admin sets a new password; increments `tokenVersion`, revokes sessions)
- No hard delete. Deactivate instead.
- Guards: an admin cannot demote or deactivate **themselves**, and the system can never be left with zero active admins (409 `LAST_ADMIN`).

### 1.6 Tests (required)
- Auth: login success/failure, timing-safe path executes, disabled account, refresh rotation, **reuse detection revokes the family**, grace-window race returns 409, expired refresh, logout, logout-all, password change invalidates old sessions, access token with stale `tv` rejected.
- **Table-driven RBAC test:** for every route in Appendix A × each role, assert allowed/forbidden. Doctor scope: other doctor's patient returns 404, lists are filtered.
- User management guards (`LAST_ADMIN`, self-demotion).

**Done when:** all tests green, typecheck clean, `docs/api-changelog.md` updated.

---

# Phase 2: Patient soft delete and Appointments

Goal: the core scheduling domain: working hours, available slots, double-booking prevention, status lifecycle.

### 2.0 Patient soft delete
- Add `isDeleted` (same convention as doctors) to `Patient`. `DELETE /patients/*` and `DELETE /doctors/:doctorId/patients/:patientId` become soft deletes. All patient queries, populates, dashboard aggregations and counts exclude deleted patients.
- Deleting a patient **cancels their future scheduled appointments** (status `cancelled`, `cancelReason: "Patient removed"`) in the same transaction (this step's wiring is completed after 2.2; implement it as soon as the Appointment model exists).
- Update the doctor delete flow from Prompt 0: refuse deletion with 409 `DOCTOR_HAS_APPOINTMENTS` (include the count) while the doctor has future `scheduled` appointments. The admin must cancel or complete them first.

### 2.1 Doctor schedule fields
Add to `Doctor` (and the create/update Zod schemas; existing doctors get defaults via a backfill in the migration script or seed):
- `timezone` (IANA string, default `"Asia/Dhaka"`; validate it is a real zone).
- `slotMinutes` (integer, multiple of 5, 10–120, default 30).
- `workingHours: Array<{ dayOfWeek: 0–6 (0 = Sunday), start: "HH:mm", end: "HH:mm" }>`. Validate: `start < end`, aligned to `slotMinutes`, **no overlapping ranges on the same day**, at most a few ranges per day. Seed default: Sunday–Thursday 09:00–17:00.
- Use **Luxon** for all timezone math (add dependency). Never compute business days with the server's local timezone.
- Changing `slotMinutes` or `workingHours` does not affect existing appointments.

### 2.2 Appointment model
`src/modules/appointments/appointment.model.ts`:
- `doctorId`, `patientId`, `startsAt`, `endsAt`, `status: "scheduled" | "completed" | "cancelled" | "no_show"` (default `scheduled`), `reason` (≤ 300 chars), `cancelReason?` (≤ 300), `createdBy` (user id), timestamps.
- Indexes: `{ doctorId: 1, startsAt: 1 }`, `{ patientId: 1, startsAt: 1 }`, `{ status: 1, startsAt: 1 }`.
- **Double-booking guard:** a **partial unique index** on `{ doctorId: 1, startsAt: 1 }` with `partialFilterExpression: { status: "scheduled" }`. This is the source of truth for race safety. Map duplicate-key errors (code 11000) on this index to **409 `SLOT_TAKEN`**, not the generic duplicate message.
- `endsAt` is always computed by the server (`startsAt + slotMinutes`); the client never sends it.

### 2.3 Availability endpoint
`GET /api/v1/doctors/:id/availability?date=YYYY-MM-DD&days=1` (`days` 1–14, default 1; all roles).
- Interpret `date` in the **doctor's timezone**. For each day, generate slots from that weekday's working hours.
- Mark a slot `available: false` if it overlaps a `scheduled` appointment, or starts before `now + MIN_BOOKING_LEAD_MINUTES` (env, default 15).
- Response: `{ doctorId, timezone, slotMinutes, days: [{ date, slots: [{ startsAt, endsAt, available }] }] }`.

### 2.4 Appointment endpoints (`/api/v1/appointments`)
- `POST /` body `{ doctorId, patientId, startsAt, reason? }`. Rules, each with a clear message and error code:
  - Doctor must exist and be active; patient must exist and not be deleted.
  - **The patient must be assigned to that doctor** (`patient.doctorId === doctorId`), otherwise 400. (Documented design decision; keep it simple.)
  - `startsAt` must equal one of the doctor's generated slots (this validates working hours, alignment and timezone in one check) → else 400 `OUTSIDE_WORKING_HOURS`.
  - Must respect the minimum lead time and be no more than 180 days ahead.
  - The patient must not already have an overlapping `scheduled` appointment → 409 `PATIENT_DOUBLE_BOOKED`.
  - Insert; rely on the partial unique index for the race → 409 `SLOT_TAKEN`.
- `GET /` paginated, sorted by `startsAt` ascending by default. Filters: `doctorId`, `patientId`, `status`, `from`, `to`. `limit` max 200 (the calendar needs many rows). Populate minimal doctor and patient fields (`name`, plus `specialization` for doctor). Scoped by role.
- `GET /:id`.
- `PATCH /:id/status` body `{ status, cancelReason? }`. Allowed transitions (encode as a map): `scheduled → completed | cancelled | no_show`; everything else is terminal → 409 `INVALID_STATUS_TRANSITION`. Extra rules: `completed` and `no_show` are only allowed once `startsAt <= now`.
- `PATCH /:id/reschedule` body `{ startsAt }`. Only for `scheduled`; same slot/lead-time/patient-overlap validation (excluding itself); unique index protects the race.
- Permissions per Appendix A. A doctor can only see/manage their own appointments (404 otherwise).

### 2.5 Dashboard for appointments
`GET /api/v1/dashboard/appointments` (all roles except none; **scoped** to the doctor for the `doctor` role). One `$facet` aggregation returning: today's total and counts by status (in the **doctor's/clinic timezone**, default `Asia/Dhaka`), the next 7 days' scheduled counts per day, no-show rate over a `range` (`7d|30d|90d|1y|all`, same as the existing dashboard), and the top 5 busiest doctors for the next 7 days (hidden for the doctor role).
Also make sure the existing dashboard counts exclude soft-deleted doctors/patients.

### 2.6 Tests (required)
- Slot generation (weekday mapping, alignment, timezone, past slots, lead time).
- Create: happy path, outside working hours, past time, wrong doctor for patient, patient overlap.
- **Race test:** two parallel `POST /appointments` for the same slot (`Promise.all`) → exactly one 201 and one 409 `SLOT_TAKEN`.
- Status transition table-driven test (all pairs). Reschedule (including onto a taken slot).
- Patient soft delete cancels future appointments; doctor delete blocked with `DOCTOR_HAS_APPOINTMENTS`.
- Doctor scope on all appointment endpoints.

---

# Phase 3: Visits (clinical notes)

Goal: a per-patient clinical timeline with strict least-privilege access.

### 3.1 Visit model
`src/modules/visits/visit.model.ts`:
- `patientId`, `doctorId`, `appointmentId?`, `visitDate`, `chiefComplaint` (≤ 300), `diagnosis` (≤ 300), `notes` (≤ 5000, plain text), `vitals?: { bpSystolic, bpDiastolic, heartRate, temperatureC, weightKg }` (all optional, with sane numeric ranges), `prescriptions?: Array<{ drug, dose, frequency, durationDays }>` (max 20), `followUpDate?`, `createdBy`, `addenda: Array<{ text (≤ 2000), by (user id), at }>`, timestamps.
- Indexes: `{ patientId: 1, visitDate: -1 }`, `{ doctorId: 1, visitDate: -1 }`, and a **partial unique index on `appointmentId`** (`partialFilterExpression: { appointmentId: { $type: "objectId" } }`) so an appointment has at most one visit.

### 3.2 Rules
- **Access:** read = `admin` and the treating `doctor` (own patients only). Write (create / edit / addendum) = the treating `doctor` only. `staff` and `viewer` get **403** on every visit endpoint (clinical content is least-privilege). See Appendix A.
- The visit's `doctorId` is taken from the authenticated doctor, never from the body. The patient must be assigned to that doctor and not deleted.
- If `appointmentId` is provided: it must belong to the same doctor and patient. Its status must be `completed`, or `scheduled` with `startsAt <= now`. In the latter case, creating the visit **marks the appointment `completed` in the same transaction**.
- **Edit window:** the author may `PATCH` a visit for `VISIT_EDIT_WINDOW_HOURS` (default 24) after creation. After that, `PATCH` returns 409 `EDIT_WINDOW_EXPIRED`, and the only way to add information is an **addendum** (append-only; addenda cannot be edited or deleted).
- No delete endpoint for visits.

### 3.3 Endpoints
- `POST /api/v1/visits`
- `GET /api/v1/patients/:patientId/visits` (timeline, `visitDate` descending, paginated)
- `GET /api/v1/visits/:id`
- `PATCH /api/v1/visits/:id`
- `POST /api/v1/visits/:id/addenda` body `{ text }`
- Enrich `GET /api/v1/appointments/:id` with `visitId` when a visit exists (for roles allowed to see it; otherwise omit).

### 3.4 Tests (required)
Role matrix for every visit endpoint; doctor scope (404 for another doctor's patient); appointment auto-completion; one visit per appointment; edit window expiry then addendum; validation ranges for vitals.

---

# Phase 4: Audit log

Goal: an append-only, queryable record of who did what, with PHI kept out of the log.

### 4.1 Request context
- Use `AsyncLocalStorage` (`src/utils/request-context.ts`): a middleware (after `authenticate`, and also for the login route) stores `{ actor: { id, role, email } | null, ip, userAgent, requestId }`. Services and the audit helper read from it, so `req` is never threaded through the service layer.
- Add `requestId` and `userId` to pino log lines via a `mixin`.

### 4.2 AuditLog model
`src/modules/audit/audit.model.ts`:
- `actorId?`, `actorRole?`, `actorEmail?` (snapshot copies, because users may change later), `action` (string such as `"doctor.update"`), `entityType`, `entityId?`, `outcome: "success" | "failure"`, `changes?: Array<{ field, from, to }>`, `metadata?: { ip, userAgent, requestId, reason? }`, `createdAt`.
- Indexes: `{ entityType: 1, entityId: 1, createdAt: -1 }`, `{ actorId: 1, createdAt: -1 }`, `{ action: 1, createdAt: -1 }`, `{ createdAt: -1 }`. Optional TTL via `AUDIT_RETENTION_DAYS` (unset = keep forever).
- **Append-only:** no update/delete routes or service methods, and add Mongoose pre-hooks that throw on `updateOne/updateMany/findOneAndUpdate/deleteOne/deleteMany/findOneAndDelete` for this model.

### 4.3 Recording helper
`auditService.record({ action, entityType, entityId, outcome?, changes?, reason? })`:
- Reads actor and request info from the request context.
- **Best-effort by design:** if writing the audit entry fails, log the error with pino and continue (the user's action must not fail). Document this decision in the README; mention that a regulated system would fail closed.
- `diffObjects(before, after, { sensitiveFields })` util producing `changes`. Central `SENSITIVE_FIELDS` config:
  - Never record values for: `passwordHash`, tokens, and visit clinical content (`notes`, `diagnosis`, `chiefComplaint`, `prescriptions`, `addenda`).
  - For PII fields (`phone`, `email` on patients), record **field names only** (`{ field: "phone", from: "[redacted]", to: "[redacted]" }`).
  - Non-sensitive fields (doctor name/specialization/hospital, appointment times/status, user role/isActive) record real values.

### 4.4 Events to record
- Auth: `auth.login.success`, `auth.login.failure` (store the attempted email; **never** the password; actor unknown), `auth.logout`, `auth.logout_all`, `auth.refresh.reuse_detected`, `auth.password.change`.
- Users: `user.create`, `user.update`, `user.reset_password`, `user.deactivate`.
- Doctors: `doctor.create`, `doctor.update`, `doctor.delete`.
- Patients: `patient.create`, `patient.update`, `patient.delete`.
- Appointments: `appointment.create`, `appointment.status_change`, `appointment.reschedule`.
- Visits: `visit.create`, `visit.update`, `visit.addendum`, and **read access logging** `visit.read` / `visit.list` (entity = the visit or the patient) because access to clinical records must be traceable.
- Failed authorization on sensitive routes (403 from `requireRole`) is recorded as `access.denied` with `outcome: "failure"`.

### 4.5 Endpoints (admin only)
- `GET /api/v1/audit` paginated, newest first. Filters: `actorId`, `entityType`, `entityId`, `action`, `outcome`, `from`, `to`.
- `GET /api/v1/audit/:id`.

### 4.6 Tests (required)
An entry is written for each event family; PHI/PII/secret fields never appear in stored `changes`; the model rejects updates/deletes; a failing audit write does not fail the request; only admin can read; filters work.

---

# Phase 5: Platform hardening and delivery

Goal: everything a reviewer looks for beyond features.

### 5.1 OpenAPI documentation
- Generate an OpenAPI 3.1 spec from the existing Zod schemas. Use `@asteasolutions/zod-to-openapi` **if it supports the installed Zod 4**, otherwise assemble the spec with Zod 4's native `z.toJSONSchema`. State which approach you chose and why.
- Serve Swagger UI at `/api/docs` and the raw spec at `/api/openapi.json` (toggle with `ENABLE_DOCS`, default on). Document the cookie auth scheme, all error responses (including `code`), and every endpoint from Phases 1–4.
- Script `openapi:export` writes `openapi.json` to the repo root so the frontend can generate types from it.

### 5.2 Operations
- `GET /api/v1/health` (liveness, unchanged) and `GET /api/v1/ready` (checks Mongoose connection state and a `ping`; 503 if not ready).
- **Graceful shutdown** in `server.ts`: on `SIGTERM`/`SIGINT`, stop accepting connections, wait for in-flight requests (with a timeout), disconnect Mongoose, exit.
- `express.json({ limit: "100kb" })`. Ensure unhandled rejections and uncaught exceptions are logged via pino before exit.
- Add ESLint (flat config, `typescript-eslint`) and Prettier; script `lint`. Fix reported issues without changing behavior.

### 5.3 Docker
- Multi-stage `Dockerfile` (current Node LTS, install with a frozen lockfile, build with `tsc`, prune dev deps, run as a **non-root** user, `HEALTHCHECK` against `/api/v1/health`). Add `.dockerignore`.
- `docker-compose.yml`: `api` + `mongo` where Mongo runs as a **single-node replica set** (so transactions work) with an init step. Env loaded from `.env`; a named volume for data; `api` depends on a healthy `mongo`.
- Document `docker compose up` in the README.

### 5.4 CI
`.github/workflows/ci.yml` on push and pull request: set up Node, cache dependencies, `yarn install --frozen-lockfile`, `lint`, `typecheck`, `test:coverage`, `build`. Add a second job that runs `docker build`. Cache the `mongodb-memory-server` binary. Add a coverage threshold on `src/modules/**/*.service.ts` (target ≥ 70% lines; do not write meaningless tests to chase numbers).

### 5.5 Demo data and benchmark
- Extend `seed-data.ts` (or add `seed:demo`): doctors with working hours, appointments spread across the past 30 days (mixed `completed` / `cancelled` / `no_show`) and the next 14 days (`scheduled`), and visits for a share of the completed appointments. All synthetic. Seeds must **refuse to run when `NODE_ENV=production`**, and any reset behavior requires `ALLOW_SEED_RESET=true`.
- `src/scripts/benchmark-dashboard.ts`: seed 50k patients into a **separate** database, run the dashboard aggregation, print timing and the `explain("executionStats")` summary (index used, docs examined). The README currently claims "under 20ms"; the README must report the **measured** number instead.

### 5.6 README rewrite
The backend README is currently a copy of the frontend README. Replace it with: overview, architecture diagram (text), module map, setup (local and Docker), env var table, scripts, API overview with a link to `/api/docs`, the RBAC matrix, running tests, and a **Technical Decisions** section covering at least: (1) double-booking via a partial unique index plus 409 mapping; (2) refresh-token rotation with reuse detection and the multi-tab grace window; (3) audit log: append-only, best-effort, PHI excluded; (4) soft deletes and transactions; (5) why a modular monolith. Include a short "limitations and what I'd do next" section and a note that this is a demo using synthetic data and is not HIPAA-compliant.

### 5.7 Final checks
`yarn lint && yarn typecheck && yarn test:coverage && yarn build` all pass; `docker compose up` brings up a working API; `/api/docs` renders; `openapi:export` works.

---

# Appendix A: Permission matrix

`own` = restricted to the doctor's own `doctorId` (out-of-scope → 404). `✓` = allowed. `✗` = 403.

| Endpoint group | admin | staff | doctor | viewer |
|---|---|---|---|---|
| Auth (own session, `/me`, password) | ✓ | ✓ | ✓ | ✓ (password change allowed) |
| Users management (`/users`) | ✓ | ✗ | ✗ | ✗ |
| Doctors: list / read / availability | ✓ | ✓ | ✓ | ✓ |
| Doctors: create / delete | ✓ | ✗ | ✗ | ✗ |
| Doctors: update | ✓ | ✗ | own, schedule fields only (Phase 2) | ✗ |
| Patients: list / read | ✓ | ✓ | own | ✓ |
| Patients: create / update | ✓ | ✓ | own | ✗ |
| Patients: delete | ✓ | ✓ | ✗ | ✗ |
| Dashboard stats (`/dashboard/stats`) | ✓ | ✓ | ✗ | ✓ |
| Dashboard appointments | ✓ | ✓ | own (scoped) | ✓ |
| Appointments: list / read | ✓ | ✓ | own | ✓ |
| Appointments: create / status / reschedule | ✓ | ✓ | own | ✗ |
| Visits: read | ✓ | ✗ | own | ✗ |
| Visits: create / edit / addendum | ✗ | ✗ | own | ✗ |
| Audit (`/audit`) | ✓ | ✗ | ✗ | ✗ |

The RBAC test in step 1.6 must cover this table; extend it as routes are added in later phases.

# Appendix B: New environment variables

Add each to the Zod env schema and `.env.example` with a sensible default (where noted):

| Variable | Default | Phase |
|---|---|---|
| `ACCESS_TOKEN_TTL_MINUTES` | 15 | 1 |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | 1 |
| `SESSION_MAX_DAYS` | 30 | 1 |
| `REFRESH_REUSE_GRACE_SECONDS` | 10 | 1 |
| `STAFF_EMAIL`, `STAFF_PASSWORD`, `DOCTOR_USER_EMAIL`, `DOCTOR_USER_PASSWORD`, `VIEWER_EMAIL`, `VIEWER_PASSWORD` | optional (seed only; no defaults) | 1 |
| `MIN_BOOKING_LEAD_MINUTES` | 15 | 2 |
| `VISIT_EDIT_WINDOW_HOURS` | 24 | 3 |
| `AUDIT_RETENTION_DAYS` | unset (keep) | 4 |
| `ENABLE_DOCS` | true | 5 |
| `ALLOW_SEED_RESET` | false | 5 |

# Appendix C: `docs/api-changelog.md` entry template

After each phase append a section per endpoint, so the frontend can be built without reading the backend code:

```
### <METHOD> <path>
Roles: ...
Query/body: ... (types, required/optional)
Success: <status> + example JSON
Errors: <status> <code>: when it happens
Notes: ...
```

Also list changed response shapes (e.g. `/auth/login` now returns `user.role`) and new error codes.

---

# Status

| Phase | Description | Status |
|---|---|---|
| 1 | Users, RBAC and sessions | [x] |
| 2 | Patient soft delete and Appointments | [x] |
| 3 | Visits (clinical notes) | [x] |
| 4 | Audit log | [x] |
| 5 | Platform hardening and delivery | [x] |
