# Doctor Tracker – Healthcare Management Portal

## Description

Doctor Tracker is a modern, high-performance administrative healthcare portal engineered to streamline the management of medical practitioners and their patient rosters. Built with a decoupled Next.js 16 frontend and a standalone Express/MongoDB backend, the platform enables authenticated healthcare administrators to oversee doctor credentials, assign and monitor patients under specific doctors, analyze patient diagnostic distribution, and inspect real-time clinical workload metrics through interactive visual dashboards.

---

## Setup Guide

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Yarn**: v1.22+ or corepack
- **MongoDB**: A local instance (`mongodb://localhost:27017/doctor_tracker`) or MongoDB Atlas URI

---

### Step-by-Step Installation

#### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd doctor-tracker-backend
   ```
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Create your `.env` configuration file:
   ```bash
   cp .env.example .env
   ```
   Configure the following environment variables in `.env`:
   ```env
   NODE_ENV=development
   PORT=5000
   CLIENT_URL=http://localhost:3000
   MONGODB_URI=mongodb://localhost:27017/doctor_tracker
   JWT_SECRET=super_secret_jwt_key_here_at_least_32_chars
   ADMIN_NAME=Healthcare Admin
   ADMIN_EMAIL=admin@doctortracker.com
   ADMIN_PASSWORD=AdminPassword123!
   ```
4. Seed the initial admin account & sample healthcare data:
   ```bash
   yarn seed:admin
   yarn seed:data
   ```
   _Note: `yarn seed:data` populates 20 doctors across diverse specializations with realistic hospital affiliations, chronologically staggered registration dates, and 2–5 linked patients each (70+ total patients)._
5. Start the backend development server:
   ```bash
   yarn dev
   ```
   The backend API will run at `http://localhost:5000/api/v1`.

---

#### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd ../doctor-tracker-frontend
   ```
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Configure environment variables in `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Ensure the backend endpoint is configured:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
   ```
4. Start the frontend development server:
   ```bash
   yarn dev
   ```
5. Open your browser and navigate to `http://localhost:3000`. You will be automatically redirected to `/dashboard` (or `/login` if unauthenticated).

---

## System Architecture

The project follows a decoupled, service-oriented architecture:

```
[ Browser / Next.js 16 Client ]
       │
       │ HTTP/REST (JSON + httpOnly JWT Cookie)
       ▼
[ Express.js 5 Application ]
  ├── Security (Helmet, CORS, Cookie-Parser)
  ├── Route Guards (authenticateAdmin middleware)
  └── Modular Handlers:
       ├── Auth Service (bcrypt, JWT token issuer)
       ├── Doctor Service (MongoDB Lean queries & compound indexes)
       ├── Patient Service (Relational refs & cascading queries)
       └── Dashboard Service (Parallelized MongoDB Aggregation Pipelines)
       │
       ▼
[ MongoDB Database ]
  ├── doctors collection (indexed on name, spec, hospital, createdAt)
  ├── patients collection (indexed on doctorId, condition, name, phone, createdAt)
  └── admins collection (indexed on email)
```

- **Data Flow**:
  1. Next.js communicates with Express REST endpoints using credentials mode (`include`) to exchange secure HTTP-only cookies.
  2. TanStack Query manages asynchronous server state, caching, query invalidation, and optimistic feedback.
  3. TanStack Table powers pagination, search filtering, and relational lookups across doctor and patient datasets.
  4. The dashboard aggregates statistics directly at the database tier using MongoDB `$facet`, `$lookup`, and `$group` operations, avoiding wasteful transfers of raw record sets to the client.

---

## Technical Decisions

### Decision 1: Server-Side MongoDB Aggregation Pipeline vs. Client-Side In-Memory Compute

- **Context**: The Admin Dashboard requires metrics including total practitioner headcounts, total patient volume, dynamic patient-to-doctor ratios, chronological registration trends, and specialty distribution.
- **Why Aggregation Won**: Pulling entire collections of thousands of patient and doctor records down to the browser to run `.filter()`, `.reduce()`, and `.length` calls would incur severe network overhead, degrade mobile battery/CPU life, and fail scalability benchmarks. Instead, we architected a single, parallelized MongoDB aggregation pipeline in `DashboardService` using `$lookup`, `$group`, and date formatting operators. The database handles the calculation across indexed fields and returns a minimal, chart-ready JSON payload in under 20ms.

### Decision 2: TanStack React Query + HTTP-Only Cookie Authentication vs. LocalStorage Tokens

- **Context**: Authentication tokens must be persisted across page reloads and protected from Cross-Site Scripting (XSS) vectors.
- **Why HTTP-Only Cookies + React Query Won**: Storing JWT tokens in `localStorage` exposes them to client-side script theft via XSS vulnerabilities. By configuring the Express server to set the `accessToken` in an `httpOnly`, `sameSite: "lax"`, and `secure` cookie, the token cannot be accessed by client JavaScript. Combining this with TanStack Query and a centralized React `AuthProvider` guarantees automatic re-validation, seamless silent session checks (`GET /auth/me`), and zero token leakage.

---

## Visual Evidence

### 1. Admin Dashboard (Desktop & Mobile)

- Overview cards for Total Doctors, Total Patients, and Patients Per Doctor.
- Interactive Recharts registration timeline (Area chart) with dynamic time filtering (`7d`, `30d`, `90d`, `1y`, `all`).
- Patients per doctor workload breakdown (Horizontal Bar chart).
- Medical specialty distribution (Donut chart) and common conditions breakdown.

### 2. Doctor Management Portal

- Full TanStack data table with debounced search by doctor name, specialty filtering, hospital filtering, and shadcn Date Picker range filters.
- "Add Doctor" modal dialog with real-time Zod schema validation.
- Dedicated Doctor & Patients page (`/doctors/[id]`): Displays doctor details (specialization, hospital, phone, email, joined date) at the top and their complete patient roster at the bottom.
- "Add Patient" modal dialog accessible right above the patient roster to register new patients directly under that practitioner.
- Shadcn Alert Dialog confirmation for securely removing patients from a doctor's care.

### 3. Dedicated Patient Management

- Full registry table with name/phone search, condition filtering, and date range filters.
- "Edit Patient" modal dialog.
- Delete confirmation dialog with cache synchronization.

### 4. Theme Support

- Instant toggling between Light and Dark themes via `next-themes` and CSS design tokens.
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 29 AM" src="https://github.com/user-attachments/assets/630fef5f-f5be-4d10-8a9a-a84c47f20596" />
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 35 AM" src="https://github.com/user-attachments/assets/627a0c01-3c5a-4531-9b62-718df4849552" />
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 34 AM" src="https://github.com/user-attachments/assets/d1d60ca8-0e47-4a7f-b4ad-88f0d67b2223" />
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 33 AM" src="https://github.com/user-attachments/assets/0be93d07-4359-4971-b17d-03812d2b9380" />
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 32 AM" src="https://github.com/user-attachments/assets/3712745f-0b67-45dd-8b65-aa6d373f637e" />
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 31 AM" src="https://github.com/user-attachments/assets/52ed876b-71a3-423e-959f-bbdff7a9229c" />
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 31 AM (2)" src="https://github.com/user-attachments/assets/bf74ce89-6e23-4f82-9d23-3faffb5e91ff" />
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 31 AM (1)" src="https://github.com/user-attachments/assets/1fbd9569-3335-45df-b4e6-ae985e85fc2f" />
<img width="576" height="1280" alt="WhatsApp Image 2026-11-01 at 12 05 30 AM" src="https://github.com/user-attachments/assets/32ebd70b-5974-4e30-b2c9-b4c2cf8d6020" />
<img width="1919" height="920" alt="Screenshot_425" src="https://github.com/user-attachments/assets/3c9aab00-6386-400b-be08-50b26d33f13b" />
<img width="1917" height="922" alt="Screenshot_424" src="https://github.com/user-attachments/assets/298a30d0-a6aa-4e33-a8fe-1153abc8b857" />
<img width="1909" height="922" alt="Screenshot_423" src="https://github.com/user-attachments/assets/1bd6142b-6d00-4dfa-9dbb-3dbe13dc19ea" />
<img width="1919" height="922" alt="Screenshot_422" src="https://github.com/user-attachments/assets/9342d1f0-973d-46d9-b316-524519daec9b" />
<img width="1919" height="921" alt="Screenshot_421" src="https://github.com/user-attachments/assets/c6872343-662c-4ed9-956e-769b415a068b" />
<img width="1919" height="920" alt="Screenshot_420" src="https://github.com/user-attachments/assets/80aa39d9-a2ee-43cd-b331-7562e9818354" />
<img width="1909" height="920" alt="Screenshot_419" src="https://github.com/user-attachments/assets/e5e89837-2f3f-4782-b392-111a6d4f6ccb" />
<img width="1907" height="921" alt="Screenshot_418" src="https://github.com/user-attachments/assets/7f144672-5da9-4cc8-a5fc-944e957479ff" />
<img width="1919" height="921" alt="Screenshot_417" src="https://github.com/user-attachments/assets/fd546964-9505-44ef-9788-da02b9563cf5" />
