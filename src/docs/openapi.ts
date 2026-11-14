import { z } from "zod";

// Zod schemas from modules
import { loginSchema, changePasswordSchema } from "../modules/auth/auth.schema.js";
import {
    createUserSchema,
    updateUserSchema,
    resetUserPasswordSchema,
    userQuerySchema,
} from "../modules/users/user.schema.js";
import {
    createDoctorSchema,
    updateDoctorSchema,
    doctorQuerySchema,
    deleteDoctorQuerySchema,
} from "../modules/doctors/doctor.schema.js";
import {
    createPatientSchema,
    updatePatientSchema,
    patientQuerySchema,
} from "../modules/patients/patient.schema.js";
import {
    createAppointmentSchema,
    updateAppointmentStatusSchema,
    rescheduleAppointmentSchema,
    appointmentQuerySchema,
} from "../modules/appointments/appointment.schema.js";
import {
    createVisitSchema,
    updateVisitSchema,
    createAddendumSchema,
    visitQuerySchema,
} from "../modules/visits/visit.schema.js";
import { auditQuerySchema } from "../modules/audit/audit.schema.js";

function cleanJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    const raw = z.toJSONSchema(schema, {
        unrepresentable: ({ message }) => {
            if (message.includes("Date")) {
                return { type: "string", format: "date-time" };
            }
            return "any";
        },
    }) as Record<string, unknown>;
    // Remove root $schema to fit nicely in components.schemas
    const { $schema: _schema, ...rest } = raw;
    return rest;
}

export const openApiSpec: Record<string, unknown> = {
    openapi: "3.1.0",
    info: {
        title: "Doctor Tracker API",
        version: "1.0.0",
        description:
            "Production-ready Express 5 + Mongoose + Zod modular monolith API for hospital doctor, patient, appointment, and clinical visit lifecycle management.",
    },
    servers: [
        {
            url: "/api/v1",
            description: "v1 API base path",
        },
    ],
    components: {
        securitySchemes: {
            cookieAuth: {
                type: "apiKey",
                in: "cookie",
                name: "accessToken",
                description:
                    "JWT Access Token sent via httpOnly, secure, sameSite cookie.",
            },
        },
        schemas: {
            StandardSuccess: {
                type: "object",
                properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string" },
                    data: { type: "object" },
                },
                required: ["success"],
            },
            StandardError: {
                type: "object",
                properties: {
                    success: { type: "boolean", example: false },
                    message: { type: "string" },
                    code: { type: "string", example: "FORBIDDEN" },
                    errors: { type: "array", items: { type: "object" } },
                },
                required: ["success", "message"],
            },
            LoginInput: cleanJsonSchema(loginSchema),
            ChangePasswordInput: cleanJsonSchema(changePasswordSchema),
            CreateUserInput: cleanJsonSchema(createUserSchema),
            UpdateUserInput: cleanJsonSchema(updateUserSchema),
            ResetUserPasswordInput: cleanJsonSchema(resetUserPasswordSchema),
            UserQueryInput: cleanJsonSchema(userQuerySchema),
            CreateDoctorInput: cleanJsonSchema(createDoctorSchema),
            UpdateDoctorInput: cleanJsonSchema(updateDoctorSchema),
            DoctorQueryInput: cleanJsonSchema(doctorQuerySchema),
            DeleteDoctorQueryInput: cleanJsonSchema(deleteDoctorQuerySchema),
            CreatePatientInput: cleanJsonSchema(createPatientSchema),
            UpdatePatientInput: cleanJsonSchema(updatePatientSchema),
            PatientQueryInput: cleanJsonSchema(patientQuerySchema),
            CreateAppointmentInput: cleanJsonSchema(createAppointmentSchema),
            UpdateAppointmentStatusInput: cleanJsonSchema(updateAppointmentStatusSchema),
            RescheduleAppointmentInput: cleanJsonSchema(rescheduleAppointmentSchema),
            AppointmentQueryInput: cleanJsonSchema(appointmentQuerySchema),
            CreateVisitInput: cleanJsonSchema(createVisitSchema),
            UpdateVisitInput: cleanJsonSchema(updateVisitSchema),
            CreateAddendumInput: cleanJsonSchema(createAddendumSchema),
            VisitQueryInput: cleanJsonSchema(visitQuerySchema),
            AuditQueryInput: cleanJsonSchema(auditQuerySchema),
        },
    },
    security: [{ cookieAuth: [] }],
    paths: {
        // Monitoring
        "/health": {
            get: {
                tags: ["System"],
                summary: "Liveness probe",
                security: [],
                responses: {
                    "200": { description: "API is healthy and running" },
                },
            },
        },
        "/ready": {
            get: {
                tags: ["System"],
                summary: "Readiness probe",
                security: [],
                responses: {
                    "200": { description: "API and Database connection are ready to serve traffic" },
                    "503": { description: "Database is not connected or ping failed" },
                },
            },
        },

        // Auth
        "/auth/login": {
            post: {
                tags: ["Auth"],
                summary: "Authenticate user and issue session cookies",
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/LoginInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "Login successful; sets accessToken and refreshToken cookies" },
                    "401": { description: "Invalid email or password" },
                    "403": { description: "User account disabled" },
                },
            },
        },
        "/auth/refresh": {
            post: {
                tags: ["Auth"],
                summary: "Rotate refresh token and issue new token pair",
                security: [],
                responses: {
                    "200": { description: "Tokens refreshed successfully" },
                    "401": { description: "Session revoked, expired, or reuse detected" },
                    "409": { description: "Multi-tab rotation grace window race" },
                },
            },
        },
        "/auth/me": {
            get: {
                tags: ["Auth"],
                summary: "Get current authenticated user profile",
                responses: {
                    "200": { description: "User profile retrieved" },
                    "401": { description: "Unauthorized or session revoked" },
                },
            },
        },
        "/auth/logout": {
            post: {
                tags: ["Auth"],
                summary: "Revoke current device session and clear cookies",
                responses: {
                    "200": { description: "Logged out successfully" },
                },
            },
        },
        "/auth/logout-all": {
            post: {
                tags: ["Auth"],
                summary: "Revoke all active sessions across all devices for current user",
                responses: {
                    "200": { description: "All sessions revoked successfully" },
                },
            },
        },
        "/auth/password": {
            patch: {
                tags: ["Auth"],
                summary: "Change account password and rotate sessions",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ChangePasswordInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "Password changed successfully" },
                    "400": { description: "Current password incorrect" },
                },
            },
        },

        // Users
        "/users": {
            get: {
                tags: ["Users"],
                summary: "List users with role and status filtering (Admin only)",
                responses: {
                    "200": { description: "Paginated users list" },
                    "403": { description: "Forbidden - Admin only" },
                },
            },
            post: {
                tags: ["Users"],
                summary: "Create a user account (Admin only)",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/CreateUserInput" },
                        },
                    },
                },
                responses: {
                    "201": { description: "User created" },
                    "409": { description: "Email already in use or doctor already assigned" },
                },
            },
        },
        "/users/{id}": {
            patch: {
                tags: ["Users"],
                summary: "Update user role, name, or active status (Admin only)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UpdateUserInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "User updated" },
                    "400": { description: "Cannot change self role or deactivate self" },
                    "409": { description: "Cannot demote or deactivate the last active admin" },
                },
            },
        },
        "/users/{id}/reset-password": {
            post: {
                tags: ["Users"],
                summary: "Reset user password (Admin only)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ResetUserPasswordInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "Password reset; prior sessions revoked" },
                },
            },
        },

        // Doctors
        "/doctors": {
            get: {
                tags: ["Doctors"],
                summary: "List active doctors with pagination and filters",
                responses: {
                    "200": { description: "Doctors retrieved" },
                },
            },
            post: {
                tags: ["Doctors"],
                summary: "Create a doctor (Admin only)",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/CreateDoctorInput" },
                        },
                    },
                },
                responses: {
                    "201": { description: "Doctor created" },
                    "400": { description: "Validation error or UNALIGNED_WORKING_HOURS" },
                    "409": { description: "Doctor with this email already exists" },
                },
            },
        },
        "/doctors/{id}": {
            get: {
                tags: ["Doctors"],
                summary: "Get doctor details by ID",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { description: "Doctor details" },
                    "404": { description: "Doctor not found" },
                },
            },
            patch: {
                tags: ["Doctors"],
                summary: "Update doctor profile (Admin or doctor own schedule)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UpdateDoctorInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "Doctor updated" },
                    "400": { description: "Validation error or UNALIGNED_WORKING_HOURS" },
                    "404": { description: "Doctor not found" },
                },
            },
            delete: {
                tags: ["Doctors"],
                summary: "Soft delete doctor with patient reassignment (Admin only)",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "reassignToDoctorId", in: "query", schema: { type: "string" } },
                ],
                responses: {
                    "200": { description: "Doctor soft deleted and patients reassigned" },
                    "409": { description: "Doctor has future scheduled appointments" },
                },
            },
        },
        "/doctors/{id}/availability": {
            get: {
                tags: ["Doctors"],
                summary: "Get bookable appointment slots in doctor's timezone",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "from", in: "query", schema: { type: "string", format: "date" } },
                    { name: "to", in: "query", schema: { type: "string", format: "date" } },
                ],
                responses: {
                    "200": { description: "Available and booked slot intervals" },
                },
            },
        },

        // Patients
        "/patients": {
            get: {
                tags: ["Patients"],
                summary: "List patients with search and pagination",
                responses: {
                    "200": { description: "Patients list" },
                },
            },
        },
        "/patients/{id}": {
            get: {
                tags: ["Patients"],
                summary: "Get patient by ID",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { description: "Patient retrieved" },
                    "404": { description: "Patient not found" },
                },
            },
            patch: {
                tags: ["Patients"],
                summary: "Update patient details",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UpdatePatientInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "Patient updated" },
                },
            },
            delete: {
                tags: ["Patients"],
                summary: "Soft delete patient and cancel future appointments (Admin/Staff only)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { description: "Patient soft-deleted" },
                    "403": { description: "Forbidden" },
                },
            },
        },
        "/doctors/{doctorId}/patients": {
            post: {
                tags: ["Patients"],
                summary: "Create patient under a doctor",
                parameters: [{ name: "doctorId", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/CreatePatientInput" },
                        },
                    },
                },
                responses: {
                    "201": { description: "Patient created" },
                },
            },
            get: {
                tags: ["Patients"],
                summary: "List patients assigned to a doctor",
                parameters: [{ name: "doctorId", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { description: "Patients list for doctor" },
                },
            },
        },

        // Appointments
        "/appointments": {
            get: {
                tags: ["Appointments"],
                summary: "List appointments with role scoping and filters",
                responses: {
                    "200": { description: "Appointments list" },
                },
            },
            post: {
                tags: ["Appointments"],
                summary: "Book an appointment slot",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/CreateAppointmentInput" },
                        },
                    },
                },
                responses: {
                    "201": { description: "Appointment booked" },
                    "400": { description: "Outside working hours or invalid slot alignment" },
                    "409": { description: "Slot taken or patient double-booked" },
                },
            },
        },
        "/appointments/{id}": {
            get: {
                tags: ["Appointments"],
                summary: "Get appointment details (enriched with visitId for authorized roles)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { description: "Appointment details" },
                    "404": { description: "Appointment not found" },
                },
            },
        },
        "/appointments/{id}/status": {
            patch: {
                tags: ["Appointments"],
                summary: "Transition appointment status (completed, cancelled, no_show)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UpdateAppointmentStatusInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "Appointment status transitioned" },
                    "409": { description: "Invalid transition from terminal state" },
                },
            },
        },
        "/appointments/{id}/reschedule": {
            patch: {
                tags: ["Appointments"],
                summary: "Reschedule appointment to a new slot",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/RescheduleAppointmentInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "Appointment rescheduled" },
                    "409": { description: "Target slot is taken" },
                },
            },
        },

        // Visits
        "/visits": {
            post: {
                tags: ["Visits"],
                summary: "Record clinical visit notes (Treating doctor only)",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/CreateVisitInput" },
                        },
                    },
                },
                responses: {
                    "201": { description: "Clinical visit recorded; appointment auto-completed" },
                    "403": { description: "Forbidden - Treating doctor only" },
                    "409": { description: "Clinical visit already exists for appointment" },
                },
            },
        },
        "/visits/{id}": {
            get: {
                tags: ["Visits"],
                summary: "Get single visit details (Admin & treating doctor only)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { description: "Visit details retrieved" },
                    "403": { description: "Forbidden" },
                },
            },
            patch: {
                tags: ["Visits"],
                summary: "Update visit within 24h edit window (Treating doctor only)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UpdateVisitInput" },
                        },
                    },
                },
                responses: {
                    "200": { description: "Visit updated" },
                    "409": { description: "Edit window expired; add addendum instead" },
                },
            },
        },
        "/visits/{id}/addenda": {
            post: {
                tags: ["Visits"],
                summary: "Append immutable addendum to clinical visit (Treating doctor only)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/CreateAddendumInput" },
                        },
                    },
                },
                responses: {
                    "201": { description: "Addendum appended" },
                },
            },
        },
        "/patients/{patientId}/visits": {
            get: {
                tags: ["Visits"],
                summary: "Get clinical timeline for a patient (Admin & treating doctor only)",
                parameters: [{ name: "patientId", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { description: "Paginated clinical timeline" },
                    "403": { description: "Forbidden" },
                },
            },
        },

        // Audit
        "/audit": {
            get: {
                tags: ["Audit"],
                summary: "Query append-only audit trail with filters (Admin only)",
                responses: {
                    "200": {
                        description: "Paginated audit records",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        data: {
                                            type: "object",
                                            properties: {
                                                logs: {
                                                    type: "array",
                                                    items: { type: "object" },
                                                },
                                                pagination: {
                                                    type: "object",
                                                    properties: {
                                                        currentPage: { type: "integer", example: 1 },
                                                        limit: { type: "integer", example: 20 },
                                                        totalAuditLogs: { type: "integer", example: 142 },
                                                        totalPages: { type: "integer", example: 8 },
                                                        hasNextPage: { type: "boolean", example: true },
                                                        hasPreviousPage: { type: "boolean", example: false },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    "403": { description: "Forbidden - Admin only" },
                },
            },
        },
        "/audit/{id}": {
            get: {
                tags: ["Audit"],
                summary: "Get single audit log entry by ID (Admin only)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { description: "Audit log entry details" },
                    "403": { description: "Forbidden" },
                    "404": { description: "Audit log entry not found" },
                },
            },
        },

        // Dashboard
        "/dashboard/stats": {
            get: {
                tags: ["Dashboard"],
                summary: "Overall system stats (Admin, Staff, Viewer)",
                responses: {
                    "200": { description: "Aggregated system statistics" },
                    "403": { description: "Forbidden" },
                },
            },
        },
        "/dashboard/appointments": {
            get: {
                tags: ["Dashboard"],
                summary: "Aggregated appointment calendar metrics",
                responses: {
                    "200": { description: "Appointment metrics for today and next 7 days" },
                },
            },
        },
    },
};
