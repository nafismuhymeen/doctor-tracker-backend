import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { AuditLog } from "../src/modules/audit/audit.model.js";
import {
    createTestDoctor,
    createTestPatient,
    createTestUser,
} from "./helpers/factories.js";
import { loginAs } from "./helpers/auth.js";

describe("Audit Logging Domain (Phase 4)", () => {
    describe("RBAC & Access Control on /api/v1/audit", () => {
        it("allows admin to query audit logs, but forbids staff, doctor, and viewer with 403", async () => {
            const { agent: adminAgent } = await loginAs("admin");
            const resAdmin = await adminAgent.get("/api/v1/audit");
            expect(resAdmin.status).toBe(200);
            expect(resAdmin.body.success).toBe(true);
            expect(resAdmin.body.data.logs).toBeDefined();

            const { agent: staffAgent } = await loginAs("staff");
            const resStaff = await staffAgent.get("/api/v1/audit");
            expect(resStaff.status).toBe(403);
            expect(resStaff.body.code).toBe("FORBIDDEN");

            const doctor = await createTestDoctor();
            const { agent: docAgent } = await loginAs("doctor", { doctorId: doctor.id });
            const resDoc = await docAgent.get("/api/v1/audit");
            expect(resDoc.status).toBe(403);
            expect(resDoc.body.code).toBe("FORBIDDEN");

            const { agent: viewerAgent } = await loginAs("viewer");
            const resViewer = await viewerAgent.get("/api/v1/audit");
            expect(resViewer.status).toBe(403);
            expect(resViewer.body.code).toBe("FORBIDDEN");

            const resUnauth = await request(app).get("/api/v1/audit");
            expect(resUnauth.status).toBe(401);
            expect(resUnauth.body.code).toBe("UNAUTHORIZED");
        });

        it("records access.denied audit event with outcome: failure when a user is denied by requireRole", async () => {
            const { agent: staffAgent, user: staffUser } = await loginAs("staff");
            await staffAgent.get("/api/v1/audit");

            const deniedLog = await AuditLog.findOne({
                action: "access.denied",
                actorId: staffUser._id,
            });

            expect(deniedLog).toBeDefined();
            expect(deniedLog!.outcome).toBe("failure");
            expect(deniedLog!.entityType).toBe("Access");
            expect(deniedLog!.metadata?.reason).toContain("staff");
        });
    });

    describe("Append-Only Immutability Guard", () => {
        it("rejects updateOne, updateMany, findOneAndUpdate, deleteOne, deleteMany, and findOneAndDelete", async () => {
            const log = await AuditLog.create({
                action: "test.immutable",
                entityType: "Test",
                outcome: "success",
            });

            await expect(
                AuditLog.updateOne({ _id: log._id }, { action: "tampered" })
            ).rejects.toThrow(/append-only/i);

            await expect(
                AuditLog.updateMany({ _id: log._id }, { action: "tampered" })
            ).rejects.toThrow(/append-only/i);

            await expect(
                AuditLog.findOneAndUpdate({ _id: log._id }, { action: "tampered" })
            ).rejects.toThrow(/append-only/i);

            await expect(
                AuditLog.deleteOne({ _id: log._id })
            ).rejects.toThrow(/append-only/i);

            await expect(
                AuditLog.deleteMany({ _id: log._id })
            ).rejects.toThrow(/append-only/i);

            await expect(
                AuditLog.findOneAndDelete({ _id: log._id })
            ).rejects.toThrow(/append-only/i);
        });
    });

    describe("Best-Effort Resilience", () => {
        it("does not fail the client request even if writing the audit log throws an error", async () => {
            const { agent: adminAgent } = await loginAs("admin");

            // Mock AuditLog.create to throw an error
            const createSpy = vi.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("Mongo connection dropped"));

            const doctorPayload = {
                name: "Dr. Resilient Test",
                specialization: "General Practice",
                hospital: "Resilience Hospital",
                email: "dr.resilient@example.com",
                phone: "+15551234567",
                timezone: "UTC",
                slotMinutes: 30,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
            };

            const res = await adminAgent.post("/api/v1/doctors").send(doctorPayload);
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.doctor.name).toBe("Dr. Resilient Test");

            createSpy.mockRestore();
        });
    });

    describe("Privacy & Redaction Guarantees", () => {
        it("never stores clinical notes or diagnoses in changes for visit events", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent } = await loginAs("doctor", { doctorId: doctor.id });

            const createRes = await docAgent.post("/api/v1/visits").send({
                patientId: patient.id,
                chiefComplaint: "TOP_SECRET_COMPLAINT",
                diagnosis: "TOP_SECRET_DIAGNOSIS",
                notes: "TOP_SECRET_CLINICAL_NOTE",
            });
            expect(createRes.status).toBe(201);

            const visitId = createRes.body.data.visit._id;

            // Update visit
            await docAgent.patch(`/api/v1/visits/${visitId}`).send({
                notes: "UPDATED_TOP_SECRET_NOTE",
                diagnosis: "UPDATED_TOP_SECRET_DIAGNOSIS",
                vitals: { heartRate: 88 },
            });

            // Add addendum
            await docAgent.post(`/api/v1/visits/${visitId}/addenda`).send({
                text: "TOP_SECRET_ADDENDUM_TEXT",
            });

            // Inspect all audit entries for this visit
            const logs = await AuditLog.find({ entityId: visitId }).lean();
            expect(logs.length).toBeGreaterThanOrEqual(3);

            for (const log of logs) {
                const changesStr = JSON.stringify(log.changes ?? []);
                expect(changesStr).not.toContain("TOP_SECRET_COMPLAINT");
                expect(changesStr).not.toContain("TOP_SECRET_DIAGNOSIS");
                expect(changesStr).not.toContain("TOP_SECRET_CLINICAL_NOTE");
                expect(changesStr).not.toContain("UPDATED_TOP_SECRET_NOTE");
                expect(changesStr).not.toContain("TOP_SECRET_ADDENDUM_TEXT");
            }
        });

        it("masks patient phone and email in changes with [redacted]", async () => {
            const doctor = await createTestDoctor();
            const { agent: adminAgent } = await loginAs("admin");

            const patientRes = await adminAgent.post(`/api/v1/doctors/${doctor.id}/patients`).send({
                name: "Private Patient",
                age: 45,
                gender: "other",
                condition: "Hypertension",
                phone: "+15559998888",
                email: "secret.patient@example.com",
            });
            expect(patientRes.status).toBe(201);
            const patientId = patientRes.body.data.patient._id;

            // Update patient phone and email
            await adminAgent.patch(`/api/v1/patients/${patientId}`).send({
                phone: "+15550001111",
                email: "new.secret@example.com",
                name: "Updated Name",
            });

            const updateLog = await AuditLog.findOne({
                action: "patient.update",
                entityId: patientId,
            }).lean();

            expect(updateLog).toBeDefined();
            const phoneChange = updateLog!.changes?.find((c) => c.field === "phone");
            const emailChange = updateLog!.changes?.find((c) => c.field === "email");
            const nameChange = updateLog!.changes?.find((c) => c.field === "name");

            expect(phoneChange).toBeDefined();
            expect(phoneChange!.to).toBe("[redacted]");

            expect(emailChange).toBeDefined();
            expect(emailChange!.to).toBe("[redacted]");

            expect(nameChange).toBeDefined();
            expect(nameChange!.to).toBe("Updated Name");
        });
    });

    describe("Event Families Verification", () => {
        it("records auth event family (login success/fail, logout, password change)", async () => {
            const { user, plainPassword } = await createTestUser({ role: "staff" });

            // 1. Login failure
            await request(app).post("/api/v1/auth/login").send({
                email: user.email,
                password: "WrongPassword123!",
            });

            const failLog = await AuditLog.findOne({
                action: "auth.login.failure",
                entityId: user.id,
            });
            expect(failLog).toBeDefined();
            expect(failLog!.outcome).toBe("failure");
            expect(failLog!.actorEmail).toBe(user.email);

            // 2. Login success
            const agent = request.agent(app);
            await agent.post("/api/v1/auth/login").send({
                email: user.email,
                password: plainPassword,
            });

            const successLog = await AuditLog.findOne({
                action: "auth.login.success",
                entityId: user.id,
            });
            expect(successLog).toBeDefined();
            expect(successLog!.outcome).toBe("success");

            // 3. Password change
            await agent.patch("/api/v1/auth/password").send({
                currentPassword: plainPassword,
                newPassword: "NewSecretPassword123!",
            });

            const pwLog = await AuditLog.findOne({
                action: "auth.password.change",
                entityId: user.id,
            });
            expect(pwLog).toBeDefined();

            // 4. Logout
            await agent.post("/api/v1/auth/logout");
            const logoutLog = await AuditLog.findOne({
                action: "auth.logout",
                entityId: user.id,
            });
            expect(logoutLog).toBeDefined();
        });

        it("records user management event family (create, update, deactivate, reset_password)", async () => {
            const { agent: adminAgent } = await loginAs("admin");

            // 1. User create
            const createRes = await adminAgent.post("/api/v1/users").send({
                name: "Audit User",
                email: "audit.user@example.com",
                password: "ValidPassword123!",
                role: "viewer",
            });
            expect(createRes.status).toBe(201);
            const userId = createRes.body.data.user.id;

            const createLog = await AuditLog.findOne({ action: "user.create", entityId: userId });
            expect(createLog).toBeDefined();

            // 2. User update & deactivate
            await adminAgent.patch(`/api/v1/users/${userId}`).send({
                name: "Renamed Audit User",
                isActive: false,
            });

            const updateLog = await AuditLog.findOne({ action: "user.update", entityId: userId });
            expect(updateLog).toBeDefined();

            const deactLog = await AuditLog.findOne({ action: "user.deactivate", entityId: userId });
            expect(deactLog).toBeDefined();

            // 3. User reset password
            await adminAgent.post(`/api/v1/users/${userId}/reset-password`).send({
                password: "BrandNewPassword123!",
            });

            const resetLog = await AuditLog.findOne({ action: "user.reset_password", entityId: userId });
            expect(resetLog).toBeDefined();
        });

        it("records doctor, patient, appointment, and visit clinical read tracking events", async () => {
            const { agent: adminAgent } = await loginAs("admin");

            // 1. Doctor create, update, delete
            const docRes = await adminAgent.post("/api/v1/doctors").send({
                name: "Dr. Audit Tracker",
                specialization: "Cardiology",
                hospital: "General Hospital",
                email: "dr.audittracker@example.com",
                phone: "+15553334444",
                timezone: "UTC",
                slotMinutes: 30,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
            });
            const doctorId = docRes.body.data.doctor._id;

            await adminAgent.patch(`/api/v1/doctors/${doctorId}`).send({
                hospital: "Metropolitan Hospital",
            });

            const docUpdateLog = await AuditLog.findOne({ action: "doctor.update", entityId: doctorId });
            expect(docUpdateLog).toBeDefined();

            // 2. Patient create & delete
            const patRes = await adminAgent.post(`/api/v1/doctors/${doctorId}/patients`).send({
                name: "Audit Patient",
                age: 30,
                gender: "male",
                condition: "Seasonal Flu",
                phone: "+15554445555",
            });
            const patientId = patRes.body.data.patient._id;

            await adminAgent.delete(`/api/v1/patients/${patientId}`);
            const patDeleteLog = await AuditLog.findOne({ action: "patient.delete", entityId: patientId });
            expect(patDeleteLog).toBeDefined();

            // Doctor delete
            await adminAgent.delete(`/api/v1/doctors/${doctorId}`);
            const docDeleteLog = await AuditLog.findOne({ action: "doctor.delete", entityId: doctorId });
            expect(docDeleteLog).toBeDefined();

            // 3. Clinical Read Access Tracing (visit.read & visit.list)
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent } = await loginAs("doctor", { doctorId: doctor.id });

            const visitRes = await docAgent.post("/api/v1/visits").send({
                patientId: patient.id,
                chiefComplaint: "Persistent Cough",
                diagnosis: "Bronchitis",
                notes: "Prescribed syrup",
            });
            const visitId = visitRes.body.data.visit._id;

            // Reading single visit
            await docAgent.get(`/api/v1/visits/${visitId}`);
            const readLog = await AuditLog.findOne({ action: "visit.read", entityId: visitId });
            expect(readLog).toBeDefined();

            // Listing patient visits
            await docAgent.get(`/api/v1/patients/${patient.id}/visits`);
            const listLog = await AuditLog.findOne({ action: "visit.list", entityId: patient.id });
            expect(listLog).toBeDefined();
        });
    });

    describe("Query & Filtering on /api/v1/audit", () => {
        it("supports filtering by action, entityType, outcome, and pagination", async () => {
            const { agent: adminAgent } = await loginAs("admin");

            // Seed distinct logs directly to verify filters
            await AuditLog.create([
                { action: "filter.test.one", entityType: "CustomEntity1", outcome: "success" },
                { action: "filter.test.two", entityType: "CustomEntity2", outcome: "failure" },
                { action: "filter.test.three", entityType: "CustomEntity1", outcome: "success" },
            ]);

            // Filter by entityType
            const resType = await adminAgent.get("/api/v1/audit?entityType=CustomEntity1");
            expect(resType.status).toBe(200);
            expect(resType.body.data.logs.every((l: any) => l.entityType === "CustomEntity1")).toBe(true);

            // Filter by outcome
            const resOutcome = await adminAgent.get("/api/v1/audit?outcome=failure");
            expect(resOutcome.status).toBe(200);
            expect(resOutcome.body.data.logs.every((l: any) => l.outcome === "failure")).toBe(true);

            // Pagination
            const resPage = await adminAgent.get("/api/v1/audit?limit=2&page=1");
            expect(resPage.status).toBe(200);
            expect(resPage.body.data.logs.length).toBeLessThanOrEqual(2);
            expect(resPage.body.data.pagination.limit).toBe(2);
            expect(resPage.body.data.pagination.page).toBe(1);

            // Get by ID
            const target = await AuditLog.findOne({ action: "filter.test.two" });
            const resId = await adminAgent.get(`/api/v1/audit/${target!._id}`);
            expect(resId.status).toBe(200);
            expect(resId.body.data.log.action).toBe("filter.test.two");

            // Nonexistent ID -> 404
            const resNotFound = await adminAgent.get(`/api/v1/audit/${new mongoose.Types.ObjectId()}`);
            expect(resNotFound.status).toBe(404);
        });
    });
});
