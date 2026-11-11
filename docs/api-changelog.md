# API Changelog

All notable changes to the Doctor Tracker API are documented here, formatted per Appendix C of the Backend Roadmap.

---

## Phase 1: Users, RBAC, and Sessions

### Overview of Changes
- Replaced legacy single-role `Admin` authentication with multi-role `User` model (`admin`, `staff`, `doctor`, `viewer`).
- Switched to short-lived access tokens (15m) and rotating refresh tokens (7d) stored in httpOnly, secure, sameSite cookies.
- Added session tracking with family-based reuse detection (theft protection) and multi-tab grace window.
- Added machine-readable error codes (`code`) on error envelopes.
- Added doctor role scoping: doctors are strictly isolated to their own records and return 404 for out-of-scope resources.
- Added admin user management endpoints under `/api/v1/users`.

### Standard Response Envelopes

**Success:**
```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Human readable error description",
  "code": "MACHINE_READABLE_CODE",
  "errors": []
}
```

---

### POST /api/v1/auth/login
Roles: Public (Rate limited: 10 req/15min)
Body:
- `email`: string, required, valid email
- `password`: string, required, 10–72 chars
Success: `200 OK`
Sets Cookies:
- `accessToken`: httpOnly, path `/`, maxAge 15m
- `refreshToken`: httpOnly, path `/api/v1/auth`, maxAge 7d
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "672e81...",
      "name": "Dr. Sarah",
      "email": "sarah@clinic.com",
      "role": "doctor",
      "doctorId": "672e80..."
    }
  }
}
```
Errors:
- `401 INVALID_CREDENTIALS`: incorrect email or password (timing-safe check)
- `403 ACCOUNT_DISABLED`: account has been deactivated (`isActive: false`)
- `400`: validation error (invalid email format or password policy)
- `429`: rate limit exceeded (10 attempts / 15m)

---

### POST /api/v1/auth/refresh
Roles: Public (requires valid `refreshToken` cookie)
Query/body: None
Success: `200 OK`
Sets new `accessToken` and rotated `refreshToken` cookies.
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "user": {
      "id": "672e81...",
      "name": "Dr. Sarah",
      "email": "sarah@clinic.com",
      "role": "doctor",
      "doctorId": "672e80..."
    }
  }
}
```
Errors:
- `401 SESSION_REVOKED`: missing or unknown token
- `401 SESSION_TERMINATED`: token reuse detected outside grace window (whole session family revoked)
- `409 TOKEN_ROTATED`: token was already rotated within 10-second grace window (multi-tab race)

---

### POST /api/v1/auth/logout
Roles: Public / Authenticated (clears current session and cookies)
Query/body: None
Success: `200 OK`
Clears `accessToken` and `refreshToken` cookies.
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### POST /api/v1/auth/logout-all
Roles: Authenticated (`admin`, `staff`, `doctor`, `viewer`)
Query/body: None
Success: `200 OK`
Revokes all active sessions for the calling user.
```json
{
  "success": true,
  "message": "All sessions logged out successfully"
}
```
Errors:
- `401 UNAUTHORIZED` / `INVALID_TOKEN`: missing or invalid access token

---

### GET /api/v1/auth/me
Roles: Authenticated (`admin`, `staff`, `doctor`, `viewer`)
Query/body: None
Success: `200 OK`
```json
{
  "success": true,
  "message": "Current user retrieved successfully",
  "data": {
    "user": {
      "id": "672e81...",
      "name": "Admin User",
      "email": "admin@clinic.com",
      "role": "admin"
    }
  }
}
```
Errors:
- `401 UNAUTHORIZED` / `INVALID_TOKEN`: unauthenticated or token superseded
- `403 ACCOUNT_DISABLED`: account deactivated

---

### PATCH /api/v1/auth/password
Roles: Authenticated (`admin`, `staff`, `doctor`, `viewer`)
Body:
- `currentPassword`: string, required
- `newPassword`: string, required, 10–72 chars, min 1 letter, min 1 digit
Success: `200 OK`
Increments `tokenVersion`, revokes all previous sessions, and sets fresh session cookies.
```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": {
    "user": {
      "id": "672e81...",
      "name": "Admin User",
      "email": "admin@clinic.com",
      "role": "admin"
    }
  }
}
```
Errors:
- `400 INVALID_CREDENTIALS`: current password incorrect
- `400`: validation error on new password policy
- `401 UNAUTHORIZED`: unauthenticated

---

### GET /api/v1/users
Roles: `admin` only
Query:
- `page`: number, optional, default 1
- `limit`: number, optional, default 10, max 100
- `role`: enum (`admin`, `staff`, `doctor`, `viewer`), optional
- `isActive`: boolean, optional
- `search`: string, optional (case-insensitive search on name and email)
Success: `200 OK`
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "users": [
      {
        "id": "672e81...",
        "name": "Jane Staff",
        "email": "jane@clinic.com",
        "role": "staff",
        "isActive": true,
        "tokenVersion": 0,
        "lastLoginAt": "2026-11-09T18:00:00.000Z",
        "createdAt": "2026-11-09T17:00:00.000Z",
        "updatedAt": "2026-11-09T17:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "limit": 10,
      "totalUsers": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```
Errors:
- `401 UNAUTHORIZED`: unauthenticated
- `403 FORBIDDEN`: user is not an admin

---

### POST /api/v1/users
Roles: `admin` only
Body:
- `name`: string, required, 2–100 chars
- `email`: string, required, valid email
- `password`: string, required, 10–72 chars, min 1 letter, min 1 digit
- `role`: enum (`admin`, `staff`, `doctor`, `viewer`), required
- `doctorId`: string, required if `role === "doctor"`, omitted/null otherwise
Success: `201 Created`
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "user": {
      "id": "672e82...",
      "name": "Dr. Gregory",
      "email": "gregory@clinic.com",
      "role": "doctor",
      "doctorId": "672e80...",
      "isActive": true,
      "tokenVersion": 0,
      "createdAt": "2026-11-09T18:00:00.000Z",
      "updatedAt": "2026-11-09T18:00:00.000Z"
    }
  }
}
```
Errors:
- `400`: missing `doctorId` when role is `doctor`, or password fails validation
- `404`: referenced doctor does not exist or is soft-deleted
- `409 EMAIL_IN_USE`: email already registered
- `409 DOCTOR_ALREADY_ASSIGNED`: doctor is already linked to another user account
- `403 FORBIDDEN`: user is not an admin

---

### PATCH /api/v1/users/:id
Roles: `admin` only
Body (at least one required):
- `name`: string, optional
- `role`: enum (`admin`, `staff`, `doctor`, `viewer`), optional
- `isActive`: boolean, optional
- `doctorId`: string | null, optional
Success: `200 OK`
Note: If role changes or `isActive` is set to `false`, the user's `tokenVersion` increments and all active sessions are revoked immediately.
```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "user": {
      "id": "672e82...",
      "name": "Dr. Gregory House",
      "email": "gregory@clinic.com",
      "role": "doctor",
      "doctorId": "672e80...",
      "isActive": true,
      "tokenVersion": 1,
      "updatedAt": "2026-11-09T18:05:00.000Z"
    }
  }
}
```
Errors:
- `400`: self-demotion or self-deactivation attempt
- `404`: user or referenced doctor not found
- `409 LAST_ADMIN`: cannot demote or deactivate the last remaining active admin
- `409 DOCTOR_ALREADY_ASSIGNED`: doctor assigned to another user

---

### POST /api/v1/users/:id/reset-password
Roles: `admin` only
Body:
- `password`: string, required, 10–72 chars, min 1 letter, min 1 digit
Success: `200 OK`
Increments `tokenVersion` and revokes all active sessions for the target user.
```json
{
  "success": true,
  "message": "User password reset successfully",
  "data": {
    "id": "672e82..."
  }
}
```
Errors:
- `400`: invalid password policy
- `404`: user not found
- `403 FORBIDDEN`: user is not an admin

---

### RBAC Permission and Scoping Updates on Existing Endpoints

| Endpoint | Permitted Roles | Scoping Behavior |
|---|---|---|
| `GET /api/v1/doctors` | `admin`, `staff`, `doctor`, `viewer` | Global list of active doctors |
| `GET /api/v1/doctors/:id` | `admin`, `staff`, `doctor`, `viewer` | Read doctor details |
| `POST /api/v1/doctors` | `admin` only | Create new doctor |
| `PATCH /api/v1/doctors/:id` | `admin` only | Update doctor profile |
| `DELETE /api/v1/doctors/:id` | `admin` only | Soft-delete doctor with reassign support |
| `GET /api/v1/doctors/:id/patients` | `admin`, `staff`, `doctor`, `viewer` | `doctor` role scoped: querying other doctor returns `404` |
| `POST /api/v1/doctors/:id/patients` | `admin`, `staff`, `doctor` | `doctor` role scoped: creating under other doctor returns `404` |
| `DELETE /api/v1/doctors/:id/patients/:pid` | `admin`, `staff` | Delete patient under doctor |
| `GET /api/v1/patients` | `admin`, `staff`, `doctor`, `viewer` | `doctor` role implicitly filters to own patients only |
| `GET /api/v1/patients/:id` | `admin`, `staff`, `doctor`, `viewer` | `doctor` role scoped: reading other doctor's patient returns `404` |
| `PATCH /api/v1/patients/:id` | `admin`, `staff`, `doctor` | `doctor` role scoped: editing other doctor's patient returns `404` |
| `DELETE /api/v1/patients/:id` | `admin`, `staff` | Delete patient |
| `GET /api/v1/dashboard/stats` | `admin`, `staff`, `viewer` | Aggregate clinic stats (`doctor` role forbidden `403`) |

---

## Phase 2: Patient Soft Delete and Appointments

### Overview of Changes
- Converted `Patient` deletion to soft delete (`isDeleted: boolean`, `deletedAt: Date | null`). Soft-deleting a patient automatically cancels their future scheduled appointments in a database transaction (`cancelReason: "Patient removed"`).
- Added schedule fields to `Doctor`: `timezone` (IANA string, default `"Asia/Dhaka"`), `slotMinutes` (10–120 in steps of 5, default 30), and `workingHours` (array of ranges per day 0–6).
- Extended `PATCH /api/v1/doctors/:id` allowing doctors to update their own schedule fields.
- Protected doctor soft deletion: refuses deletion with `409 DOCTOR_HAS_APPOINTMENTS` if future scheduled appointments exist.
- Implemented core scheduling domain (`/api/v1/appointments`) with concurrency-safe slot booking using a partial unique index, minimum booking lead time, advance booking window, and patient double-booking protection.
- Added appointments dashboard endpoint: `GET /api/v1/dashboard/appointments` with `$facet` aggregation.

---

### GET /api/v1/doctors/:id/availability
Roles: `admin`, `staff`, `doctor`, `viewer`
Query:
- `date`: string, required, `YYYY-MM-DD` format
- `days`: number, optional, 1–14 (default 1)
Success: `200 OK`
```json
{
  "success": true,
  "message": "Doctor availability retrieved successfully",
  "data": {
    "doctorId": "672e80...",
    "timezone": "Asia/Dhaka",
    "slotMinutes": 30,
    "days": [
      {
        "date": "2026-11-15",
        "slots": [
          {
            "startsAt": "2026-11-15T03:00:00.000Z",
            "endsAt": "2026-11-15T03:30:00.000Z",
            "available": true
          },
          {
            "startsAt": "2026-11-15T03:30:00.000Z",
            "endsAt": "2026-11-15T04:00:00.000Z",
            "available": false
          }
        ]
      }
    ]
  }
}
```
Errors:
- `400`: invalid doctor ID or date format
- `404`: doctor not found or inactive

---

### PATCH /api/v1/doctors/:id (Schedule Update)
Roles: `admin` (all fields), `doctor` (own record only, schedule fields only)
Body:
- `timezone`: string, optional (valid IANA timezone)
- `slotMinutes`: number, optional (multiple of 5, 10–120)
- `workingHours`: array of `{ dayOfWeek: 0–6, start: "HH:mm", end: "HH:mm" }`, optional
Success: `200 OK`
```json
{
  "success": true,
  "message": "Doctor schedule updated successfully",
  "data": {
    "doctor": {
      "id": "672e80...",
      "name": "Dr. Sarah",
      "timezone": "Asia/Dhaka",
      "slotMinutes": 45,
      "workingHours": [
        { "dayOfWeek": 0, "start": "09:00", "end": "17:00" }
      ]
    }
  }
}
```
Errors:
- `400`: validation error (overlapping ranges, invalid format, start >= end)
- `403 FORBIDDEN`: staff/viewer attempting update
- `404`: doctor not found or doctor accessing another doctor's record

---

### POST /api/v1/appointments
Roles: `admin`, `staff`, `doctor` (doctor-scoped)
Body:
- `doctorId`: string, required (valid ObjectId)
- `patientId`: string, required (valid ObjectId, must belong to doctor)
- `startsAt`: ISO-8601 string, required
- `reason`: string, optional (max 300 chars)
Success: `201 Created`
```json
{
  "success": true,
  "message": "Appointment scheduled successfully",
  "data": {
    "appointment": {
      "id": "672e90...",
      "doctorId": "672e80...",
      "patientId": "672e85...",
      "startsAt": "2026-11-15T03:00:00.000Z",
      "endsAt": "2026-11-15T03:30:00.000Z",
      "status": "scheduled",
      "reason": "Routine Checkup",
      "createdBy": "672e81...",
      "createdAt": "2026-11-09T20:00:00.000Z"
    }
  }
}
```
Errors:
- `400 OUTSIDE_WORKING_HOURS`: startsAt does not align with doctor's working slots
- `400`: patient not assigned to doctor, or lead time / max 180 days advance violation
- `404`: doctor or patient not found or inactive
- `409 PATIENT_DOUBLE_BOOKED`: patient already has an appointment during this time
- `409 SLOT_TAKEN`: slot already booked by another patient (race-condition safe)

---

### GET /api/v1/appointments
Roles: `admin`, `staff`, `doctor` (scoped to own), `viewer`
Query:
- `page`: number, optional, default 1
- `limit`: number, optional, default 20, max 200
- `doctorId`: string, optional
- `patientId`: string, optional
- `status`: enum (`scheduled`, `completed`, `cancelled`, `no_show`), optional
- `from`: ISO-8601 date, optional
- `to`: ISO-8601 date, optional
Success: `200 OK`
```json
{
  "success": true,
  "message": "Appointments retrieved successfully",
  "data": {
    "appointments": [
      {
        "_id": "672e90...",
        "doctorId": {
          "_id": "672e80...",
          "name": "Dr. Sarah",
          "specialization": "Cardiology",
          "hospital": "City Hospital"
        },
        "patientId": {
          "_id": "672e85...",
          "name": "John Doe",
          "phone": "+1234567890"
        },
        "startsAt": "2026-11-15T03:00:00.000Z",
        "endsAt": "2026-11-15T03:30:00.000Z",
        "status": "scheduled"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "limit": 20,
      "totalAppointments": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```
Errors:
- `401 UNAUTHORIZED`: unauthenticated
- `404`: doctor role querying other doctor's appointments

---

### GET /api/v1/appointments/:id
Roles: `admin`, `staff`, `doctor` (scoped to own), `viewer`
Success: `200 OK`
```json
{
  "success": true,
  "message": "Appointment retrieved successfully",
  "data": {
    "appointment": {
      "_id": "672e90...",
      "doctorId": { ... },
      "patientId": { ... },
      "startsAt": "2026-11-15T03:00:00.000Z",
      "endsAt": "2026-11-15T03:30:00.000Z",
      "status": "scheduled",
      "reason": "Routine Checkup"
    }
  }
}
```
Errors:
- `404`: appointment not found or out of doctor's scope

---

### PATCH /api/v1/appointments/:id/status
Roles: `admin`, `staff`, `doctor` (scoped to own)
Body:
- `status`: enum (`completed`, `cancelled`, `no_show`), required
- `cancelReason`: string, optional (max 300)
Success: `200 OK`
```json
{
  "success": true,
  "message": "Appointment status updated successfully",
  "data": {
    "appointment": {
      "_id": "672e90...",
      "status": "cancelled",
      "cancelReason": "Patient requested cancellation"
    }
  }
}
```
Errors:
- `400`: attempting to complete or mark no-show for future appointments
- `404`: appointment not found or out of doctor's scope
- `409 INVALID_STATUS_TRANSITION`: attempting transition from non-scheduled (terminal) status

---

### PATCH /api/v1/appointments/:id/reschedule
Roles: `admin`, `staff`, `doctor` (scoped to own)
Body:
- `startsAt`: ISO-8601 string, required
Success: `200 OK`
```json
{
  "success": true,
  "message": "Appointment rescheduled successfully",
  "data": {
    "appointment": {
      "_id": "672e90...",
      "startsAt": "2026-11-16T04:00:00.000Z",
      "endsAt": "2026-11-16T04:30:00.000Z",
      "status": "scheduled"
    }
  }
}
```
Errors:
- `400 OUTSIDE_WORKING_HOURS`: startsAt outside doctor working hours
- `404`: appointment not found or out of scope
- `409 INVALID_STATUS_TRANSITION`: appointment is not in `scheduled` status
- `409 PATIENT_DOUBLE_BOOKED`: patient has conflicting scheduled appointment
- `409 SLOT_TAKEN`: new slot is already booked

---

### GET /api/v1/dashboard/appointments
Roles: `admin`, `staff`, `viewer`, `doctor` (scoped to own doctor)
Query:
- `range`: enum (`7d`, `30d`, `90d`, `1y`, `all`), default `30d`
- `startDate`: ISO date string, optional
- `endDate`: ISO date string, optional
Success: `200 OK`
```json
{
  "success": true,
  "message": "Appointments dashboard statistics retrieved successfully",
  "data": {
    "today": {
      "total": 5,
      "scheduled": 2,
      "completed": 2,
      "cancelled": 1,
      "noShow": 0
    },
    "next7Days": [
      { "date": "2026-11-10", "scheduledCount": 4 },
      { "date": "2026-11-11", "scheduledCount": 3 }
    ],
    "noShowRate": {
      "ratePercentage": 4.5,
      "noShowCount": 2,
      "totalAppointments": 44,
      "range": "30d"
    },
    "topBusiestDoctors": [
      {
        "doctorId": "672e80...",
        "name": "Dr. Sarah",
        "specialization": "Cardiology",
        "hospital": "City Hospital",
        "scheduledCount": 12
      }
    ]
  }
}
```
Note: `topBusiestDoctors` is omitted when called by a user with role `doctor`.

---

## Phase 3: Visits (Clinical Notes)

### Overview of Changes
- Implemented clinical notes domain with strict least-privilege access:
  - Clinical writes (`POST /visits`, `PATCH /visits/:id`, `POST /visits/:id/addenda`) restricted to treating doctors only (forbids `admin`, `staff`, `viewer` with `403`).
  - Clinical reads (`GET /visits/:id`, `GET /patients/:patientId/visits`) restricted to `admin` and treating `doctor` (forbids `staff` and `viewer` with `403`).
- Added appointment auto-completion: linking a past `scheduled` appointment auto-completes it in the same transaction.
- Partial unique index on `appointmentId`: at most one clinical visit per appointment (`409 VISIT_EXISTS`).
- Clinical notes edit window: editable by author for `VISIT_EDIT_WINDOW_HOURS` (default 24h); after expiration, modifications are rejected with `409 EDIT_WINDOW_EXPIRED`.
- Append-only addenda: doctors may add addenda to visits anytime, even after the edit window has expired.
- Enriched `GET /api/v1/appointments/:id` with `visitId` for permitted roles (`admin`, treating `doctor`).

---

### POST /api/v1/visits
Roles: `doctor` (treating doctor only)
Body:
- `patientId`: string, required (valid ObjectId, must belong to doctor)
- `appointmentId`: string, optional (valid ObjectId, must match patient & doctor)
- `visitDate`: ISO date string, optional (defaults to now)
- `chiefComplaint`: string, required (1–300 chars)
- `diagnosis`: string, required (1–300 chars)
- `notes`: string, required (1–5000 chars)
- `vitals`: object, optional
  - `bpSystolic`: number (50–250)
  - `bpDiastolic`: number (30–150)
  - `heartRate`: number (30–250)
  - `temperatureC`: number (30–45)
  - `weightKg`: number (1–300)
- `prescriptions`: array, optional (max 20 items)
  - `drug`: string (1–100 chars)
  - `dose`: string (1–50 chars)
  - `frequency`: string (1–50 chars)
  - `durationDays`: number (1–365)
- `followUpDate`: ISO date string, optional
Success: `201 Created`
```json
{
  "success": true,
  "message": "Clinical visit recorded successfully",
  "data": {
    "visit": {
      "id": "672ea0...",
      "patientId": "672e85...",
      "doctorId": "672e80...",
      "appointmentId": "672e90...",
      "visitDate": "2026-11-09T22:00:00.000Z",
      "chiefComplaint": "Persistent cough",
      "diagnosis": "Acute bronchitis",
      "notes": "Patient advised rest, hydration, and prescribed inhaler.",
      "vitals": {
        "bpSystolic": 120,
        "bpDiastolic": 80,
        "heartRate": 75,
        "temperatureC": 37.2,
        "weightKg": 68
      },
      "prescriptions": [
        {
          "drug": "Albuterol Inhaler",
          "dose": "90mcg",
          "frequency": "2 puffs every 4-6 hours prn",
          "durationDays": 14
        }
      ],
      "addenda": [],
      "createdBy": "672e81...",
      "createdAt": "2026-11-09T22:00:00.000Z"
    }
  }
}
```
Errors:
- `400`: validation error (e.g. out-of-range vitals, invalid lengths) or linking future scheduled appointment
- `403 FORBIDDEN`: non-doctor role (admin, staff, viewer)
- `404`: patient not found or not assigned to doctor
- `409 VISIT_EXISTS`: visit already recorded for this appointment

---

### GET /api/v1/patients/:patientId/visits
Roles: `admin`, `doctor` (treating doctor only)
Query:
- `page`: number, optional, default 1
- `limit`: number, optional, default 10, max 100
Success: `200 OK`
```json
{
  "success": true,
  "message": "Patient clinical timeline retrieved successfully",
  "data": {
    "visits": [
      {
        "_id": "672ea0...",
        "doctorId": {
          "_id": "672e80...",
          "name": "Dr. Sarah",
          "specialization": "Cardiology",
          "hospital": "City Hospital"
        },
        "patientId": "672e85...",
        "visitDate": "2026-11-09T22:00:00.000Z",
        "chiefComplaint": "Persistent cough",
        "diagnosis": "Acute bronchitis",
        "notes": "Patient advised rest...",
        "addenda": []
      }
    ],
    "pagination": {
      "currentPage": 1,
      "limit": 10,
      "totalVisits": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```
Errors:
- `403 FORBIDDEN`: staff, viewer
- `404`: patient not found or out of doctor's scope

---

### GET /api/v1/visits/:id
Roles: `admin`, `doctor` (treating doctor only)
Success: `200 OK`
```json
{
  "success": true,
  "message": "Clinical visit retrieved successfully",
  "data": {
    "visit": {
      "_id": "672ea0...",
      "doctorId": {
        "_id": "672e80...",
        "name": "Dr. Sarah",
        "specialization": "Cardiology",
        "hospital": "City Hospital"
      },
      "patientId": {
        "_id": "672e85...",
        "name": "John Doe",
        "phone": "+1234567890",
        "email": "john@test.com"
      },
      "chiefComplaint": "Persistent cough",
      "diagnosis": "Acute bronchitis",
      "notes": "Patient advised rest...",
      "vitals": { ... },
      "prescriptions": [ ... ],
      "addenda": []
    }
  }
}
```
Errors:
- `403 FORBIDDEN`: staff, viewer
- `404`: visit not found or out of doctor's scope

---

### PATCH /api/v1/visits/:id
Roles: `doctor` (author doctor only)
Body (at least one field required):
- `chiefComplaint`: string, optional (1–300 chars)
- `diagnosis`: string, optional (1–300 chars)
- `notes`: string, optional (1–5000 chars)
- `vitals`: object, optional
- `prescriptions`: array, optional (max 20)
- `followUpDate`: ISO date string, optional, nullable
Success: `200 OK`
```json
{
  "success": true,
  "message": "Clinical visit updated successfully",
  "data": {
    "visit": {
      "_id": "672ea0...",
      "diagnosis": "Acute bronchitis (resolved)",
      "notes": "Follow-up notes updated."
    }
  }
}
```
Errors:
- `400`: validation error
- `403 FORBIDDEN`: non-doctor role
- `404`: visit not found or not author's visit
- `409 EDIT_WINDOW_EXPIRED`: edit window (> 24 hours) has expired; add an addendum instead

---

### POST /api/v1/visits/:id/addenda
Roles: `doctor` (author doctor only)
Body:
- `text`: string, required (1–2000 chars)
Success: `201 Created`
```json
{
  "success": true,
  "message": "Addendum added to clinical visit successfully",
  "data": {
    "visit": {
      "_id": "672ea0...",
      "addenda": [
        {
          "text": "Late lab result: Sputum culture negative.",
          "by": "672e81...",
          "at": "2026-11-10T12:00:00.000Z"
        }
      ]
    }
  }
}
```
Errors:
- `400`: validation error
- `403 FORBIDDEN`: non-doctor role
- `404`: visit not found or not author's visit

---

## Phase 4: Audit Log

### Overview of Changes
- Implemented ambient request context tracking using `AsyncLocalStorage` (`actor`, `ip`, `userAgent`, `requestId`).
- Structured logging via Pino mixin automatically injecting `requestId` and `userId` into log records.
- Append-only `AuditLog` collection enforcing immutability via Mongoose schema pre-hooks rejecting any update or delete operations.
- Best-effort audit logging strategy: audit write failures are logged via pino and never fail the primary user request.
- Diff utility `diffObjects` sanitizing sensitive data (secrets, clinical content excluded; patient PII `phone`/`email` masked as `[redacted]`).
- Clinical read access tracing: logs `visit.read` and `visit.list` whenever clinical visit records are queried.
- Security access tracking: failed authorization via `requireRole` logs `access.denied` with `outcome: "failure"`.
- Admin-only audit querying endpoints under `/api/v1/audit`.

---

### GET /api/v1/audit
Roles: `admin` only (`staff`, `doctor`, `viewer` get 403 `FORBIDDEN`)
Query parameters:
- `page`: integer, min 1 (default: 1)
- `limit`: integer, min 1, max 100 (default: 20)
- `actorId`: string, optional (user ObjectId)
- `entityType`: string, optional (e.g. `User`, `Doctor`, `Patient`, `Appointment`, `Visit`, `Auth`, `Access`)
- `entityId`: string, optional
- `action`: string, optional (e.g. `auth.login.success`, `patient.update`)
- `outcome`: string, optional (`success` or `failure`)
- `from`: ISO date string, optional
- `to`: ISO date string, optional

Success: `200 OK`
```json
{
  "success": true,
  "message": "Audit logs retrieved successfully",
  "data": {
    "logs": [
      {
        "_id": "672eb1...",
        "actorId": "672e81...",
        "actorRole": "admin",
        "actorEmail": "admin@clinic.com",
        "action": "doctor.update",
        "entityType": "Doctor",
        "entityId": "672e80...",
        "outcome": "success",
        "changes": [
          {
            "field": "hospital",
            "from": "Old Hospital",
            "to": "New Metropolitan Hospital"
          }
        ],
        "metadata": {
          "ip": "127.0.0.1",
          "userAgent": "Mozilla/5.0...",
          "requestId": "req-12345"
        },
        "createdAt": "2026-11-10T01:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "limit": 20,
      "totalAuditLogs": 142,
      "totalPages": 8,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```
Errors:
- `401 UNAUTHORIZED`: unauthenticated
- `403 FORBIDDEN`: non-admin role

---

### GET /api/v1/audit/:id
Roles: `admin` only (`staff`, `doctor`, `viewer` get 403 `FORBIDDEN`)
Path parameters:
- `id`: string, required (audit log ObjectId)

Success: `200 OK`
```json
{
  "success": true,
  "message": "Audit log retrieved successfully",
  "data": {
    "log": {
      "_id": "672eb1...",
      "actorId": "672e81...",
      "actorRole": "admin",
      "actorEmail": "admin@clinic.com",
      "action": "patient.update",
      "entityType": "Patient",
      "entityId": "672e90...",
      "outcome": "success",
      "changes": [
        {
          "field": "phone",
          "from": "[redacted]",
          "to": "[redacted]"
        }
      ],
      "metadata": {
        "ip": "127.0.0.1",
        "userAgent": "Mozilla/5.0...",
        "requestId": "req-67890"
      },
      "createdAt": "2026-11-10T01:05:00.000Z"
    }
  }
}
```
Errors:
- `400`: invalid ID parameter
- `401 UNAUTHORIZED`: unauthenticated
- `403 FORBIDDEN`: non-admin role
- `404`: audit log not found

---

## Phase 5: Platform Hardening and Delivery

### Overview of Changes
- Generated OpenAPI 3.1 specification directly from Zod 4 schemas with automated export script (`yarn openapi:export`).
- Mounted dynamic Swagger UI at `/api/docs` and raw OpenAPI schema at `/api/openapi.json` (toggled by `ENABLE_DOCS`).
- Implemented Kubernetes / Docker orchestrator probes: `GET /api/v1/health` (liveness) and `GET /api/v1/ready` (readiness via active MongoDB ping).
- Hardened body parser limits: requests over 100kb are rejected with `413 PAYLOAD_TOO_LARGE`.
- Implemented graceful shutdown in `server.ts` with connection draining, active request timeouts, Mongoose disconnect, and Pino uncaughtException/unhandledRejection handling.
- Configured ESLint 10 + typescript-eslint flat config with strict rules and Prettier formatting.
- Multi-stage Dockerfile with non-root security (`appuser`) and container healthcheck.
- Docker Compose with auto-initiating MongoDB single-node replica set for multi-document transaction support.
- GitHub Actions CI workflow with Node, Yarn, and MongoDB-Memory-Server binary caching.
- Enforced ≥ 70% line test coverage on all domain services.
- Added demo seeding script (`yarn seed:demo`) and 50k patient dashboard aggregation benchmark (`yarn benchmark:dashboard`).

---

### GET /api/v1/health
Roles: Public (no authentication required)
Query/body: None
Success: `200 OK`
```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "healthy",
    "uptime": 12.34,
    "timestamp": "2026-11-10T01:30:00.000Z"
  }
}
```
Errors: None

---

### GET /api/v1/ready
Roles: Public (no authentication required)
Query/body: None
Success: `200 OK` (when MongoDB responds to ping)
```json
{
  "success": true,
  "message": "Service is ready",
  "data": {
    "status": "ready",
    "database": "connected",
    "timestamp": "2026-11-10T01:30:00.000Z"
  }
}
```
Errors:
- `503 Service Unavailable`: MongoDB is disconnected or ping fails:
```json
{
  "success": false,
  "message": "Database is not ready",
  "code": "DATABASE_UNAVAILABLE"
}
```

---

### GET /api/openapi.json
Roles: Public (served when `ENABLE_DOCS=true`)
Query/body: None
Success: `200 OK` (returns OpenAPI 3.1.0 specification object)
Errors:
- `404 Not Found`: if `ENABLE_DOCS=false`

---

### GET /api/docs
Roles: Public (served when `ENABLE_DOCS=true`)
Query/body: None
Success: `200 OK` (HTML Swagger UI with customized CSP)
Errors:
- `404 Not Found`: if `ENABLE_DOCS=false`

---

### Request Payload Limiting (Global)
- Express JSON parser is restricted to `100kb`.
- Any request with a body exceeding this limit is rejected with status `413`:
```json
{
  "success": false,
  "message": "Request payload exceeds 100kb limit",
  "code": "PAYLOAD_TOO_LARGE"
}
```





