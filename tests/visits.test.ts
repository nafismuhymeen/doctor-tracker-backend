import { describe, it, expect } from "vitest";
import {
    createTestAppointment,
    createTestDoctor,
    createTestPatient,
    createTestUser,
    createTestVisit,
} from "./helpers/factories.js";
import { loginAs } from "./helpers/auth.js";
import { Appointment } from "../src/modules/appointments/appointment.model.js";
import { Visit } from "../src/modules/visits/visit.model.js";

describe("Visits Domain (Clinical Notes - Phase 3)", () => {
    describe("Least-Privilege Permissions (Appendix A)", () => {
        it("allows treating doctor to create a visit, but forbids admin, staff, and viewer with 403", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);

            const visitPayload = {
                patientId: patient.id,
                chiefComplaint: "Severe headache",
                diagnosis: "Migraine",
                notes: "Patient prescribed rest and hydration.",
                vitals: {
                    bpSystolic: 120,
                    bpDiastolic: 80,
                    heartRate: 72,
                    temperatureC: 37.0,
                    weightKg: 70,
                },
            };

            // Doctor succeeds
            const { agent: docAgent } = await loginAs("doctor", { doctorId: doctor.id });
            const docRes = await docAgent.post("/api/v1/visits").send(visitPayload);
            expect(docRes.status).toBe(201);
            expect(docRes.body.success).toBe(true);
            expect(docRes.body.data.visit.diagnosis).toBe("Migraine");

            // Admin is forbidden from clinical write
            const { agent: adminAgent } = await loginAs("admin");
            const adminRes = await adminAgent.post("/api/v1/visits").send(visitPayload);
            expect(adminRes.status).toBe(403);
            expect(adminRes.body.code).toBe("FORBIDDEN");

            // Staff is forbidden
            const { agent: staffAgent } = await loginAs("staff");
            const staffRes = await staffAgent.post("/api/v1/visits").send(visitPayload);
            expect(staffRes.status).toBe(403);
            expect(staffRes.body.code).toBe("FORBIDDEN");

            // Viewer is forbidden
            const { agent: viewerAgent } = await loginAs("viewer");
            const viewerRes = await viewerAgent.post("/api/v1/visits").send(visitPayload);
            expect(viewerRes.status).toBe(403);
            expect(viewerRes.body.code).toBe("FORBIDDEN");
        });

        it("allows admin and treating doctor to read visits, but forbids staff and viewer with 403", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent, user: docUser } = await loginAs("doctor", {
                doctorId: doctor.id,
            });
            const visit = await createTestVisit(doctor.id, patient.id, docUser.id);
            const docRes = await docAgent.get(`/api/v1/visits/${visit.id}`);
            expect(docRes.status).toBe(200);

            // Admin can read
            const { agent: adminAgent } = await loginAs("admin");
            const adminRes = await adminAgent.get(`/api/v1/visits/${visit.id}`);
            expect(adminRes.status).toBe(200);

            // Staff is forbidden
            const { agent: staffAgent } = await loginAs("staff");
            const staffRes = await staffAgent.get(`/api/v1/visits/${visit.id}`);
            expect(staffRes.status).toBe(403);
            expect(staffRes.body.code).toBe("FORBIDDEN");

            // Viewer is forbidden
            const { agent: viewerAgent } = await loginAs("viewer");
            const viewerRes = await viewerAgent.get(`/api/v1/visits/${visit.id}`);
            expect(viewerRes.status).toBe(403);
            expect(viewerRes.body.code).toBe("FORBIDDEN");

            // Patient clinical timeline read permissions
            const timelineDocRes = await docAgent.get(`/api/v1/patients/${patient.id}/visits`);
            expect(timelineDocRes.status).toBe(200);

            const timelineAdminRes = await adminAgent.get(`/api/v1/patients/${patient.id}/visits`);
            expect(timelineAdminRes.status).toBe(200);

            const timelineStaffRes = await staffAgent.get(`/api/v1/patients/${patient.id}/visits`);
            expect(timelineStaffRes.status).toBe(403);
        });
    });

    describe("Doctor Scoping & Patient Isolation", () => {
        it("returns 404 when doctor attempts to read or create a visit for another doctor's patient", async () => {
            const docA = await createTestDoctor({ name: "Dr. A" });
            const docB = await createTestDoctor({ name: "Dr. B" });

            const _patientA = await createTestPatient(docA.id);
            const patientB = await createTestPatient(docB.id);

            const { agent: docAAgent } = await loginAs("doctor", { doctorId: docA.id });
            const { user: docBUser } = await createTestUser({ role: "doctor", doctorId: docB.id });

            const visitB = await createTestVisit(docB.id, patientB.id, docBUser.id);

            // Doc A reading Doc B's visit returns 404
            const readRes = await docAAgent.get(`/api/v1/visits/${visitB.id}`);
            expect(readRes.status).toBe(404);

            // Doc A reading Doc B's patient timeline returns 404
            const timelineRes = await docAAgent.get(`/api/v1/patients/${patientB.id}/visits`);
            expect(timelineRes.status).toBe(404);

            // Doc A creating visit under Doc B's patient returns 404
            const createRes = await docAAgent.post("/api/v1/visits").send({
                patientId: patientB.id,
                chiefComplaint: "Infiltration test",
                diagnosis: "None",
                notes: "Should fail with 404",
            });
            expect(createRes.status).toBe(404);
        });
    });

    describe("Appointment Auto-Completion & Linkage", () => {
        it("auto-completes a past scheduled appointment when linking to a visit", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent, user: docUser } = await loginAs("doctor", {
                doctorId: doctor.id,
            });

            // Scheduled appointment in the past (1 hour ago)
            const pastStart = new Date(Date.now() - 60 * 60 * 1000);
            const appt = await createTestAppointment(doctor.id, patient.id, docUser.id, {
                startsAt: pastStart,
                status: "scheduled",
            });

            const res = await docAgent.post("/api/v1/visits").send({
                patientId: patient.id,
                appointmentId: appt.id,
                chiefComplaint: "Follow-up check",
                diagnosis: "Recovering nicely",
                notes: "Vitals normal.",
            });

            expect(res.status).toBe(201);
            expect(res.body.data.visit.appointmentId).toBe(appt.id);

            // Verify appointment status was automatically marked completed
            const updatedAppt = await Appointment.findById(appt.id);
            expect(updatedAppt?.status).toBe("completed");
        });

        it("rejects linking a future scheduled appointment with 400", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent, user: docUser } = await loginAs("doctor", {
                doctorId: doctor.id,
            });

            // Scheduled appointment in the future
            const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const appt = await createTestAppointment(doctor.id, patient.id, docUser.id, {
                startsAt: futureStart,
                status: "scheduled",
            });

            const res = await docAgent.post("/api/v1/visits").send({
                patientId: patient.id,
                appointmentId: appt.id,
                chiefComplaint: "Premature visit",
                diagnosis: "None",
                notes: "Should fail",
            });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain("future");
        });

        it("guarantees at most one visit per appointment with 409 VISIT_EXISTS", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent, user: docUser } = await loginAs("doctor", {
                doctorId: doctor.id,
            });

            const pastStart = new Date(Date.now() - 60 * 60 * 1000);
            const appt = await createTestAppointment(doctor.id, patient.id, docUser.id, {
                startsAt: pastStart,
                status: "completed",
            });

            // First visit succeeds
            const res1 = await docAgent.post("/api/v1/visits").send({
                patientId: patient.id,
                appointmentId: appt.id,
                chiefComplaint: "First check",
                diagnosis: "Diagnosis 1",
                notes: "Notes 1",
            });
            expect(res1.status).toBe(201);

            // Second visit for same appointment fails with 409
            const res2 = await docAgent.post("/api/v1/visits").send({
                patientId: patient.id,
                appointmentId: appt.id,
                chiefComplaint: "Duplicate check",
                diagnosis: "Diagnosis 2",
                notes: "Notes 2",
            });
            expect(res2.status).toBe(409);
            expect(res2.body.code).toBe("VISIT_EXISTS");
        });
    });

    describe("Edit Window Expiry & Append-Only Addenda", () => {
        it("allows author doctor to PATCH visit within 24 hours", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent, user: docUser } = await loginAs("doctor", {
                doctorId: doctor.id,
            });

            const visit = await createTestVisit(doctor.id, patient.id, docUser.id);

            const res = await docAgent.patch(`/api/v1/visits/${visit.id}`).send({
                diagnosis: "Updated Diagnosis within window",
                notes: "Additional observations added.",
            });

            expect(res.status).toBe(200);
            expect(res.body.data.visit.diagnosis).toBe(
                "Updated Diagnosis within window"
            );
        });

        it("rejects PATCH after 24 hours with 409 EDIT_WINDOW_EXPIRED", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent, user: docUser } = await loginAs("doctor", {
                doctorId: doctor.id,
            });

            // Created 25 hours ago
            const oldVisit = await createTestVisit(doctor.id, patient.id, docUser.id, {
                createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
            } as any);

            // Update createdAt in DB directly to bypass timestamps
            await Visit.findByIdAndUpdate(oldVisit.id, {
                createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
            });

            const res = await docAgent.patch(`/api/v1/visits/${oldVisit.id}`).send({
                diagnosis: "Late modification attempt",
            });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("EDIT_WINDOW_EXPIRED");
        });

        it("allows adding addenda to visit at any time (even after edit window expired)", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent, user: docUser } = await loginAs("doctor", {
                doctorId: doctor.id,
            });

            // Old visit (expired edit window)
            const oldVisit = await createTestVisit(doctor.id, patient.id, docUser.id);
            await Visit.findByIdAndUpdate(oldVisit.id, {
                createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
            });

            const addendumRes = await docAgent
                .post(`/api/v1/visits/${oldVisit.id}/addenda`)
                .send({
                    text: "Lab results arrived late: Hemoglobin normal.",
                });

            expect(addendumRes.status).toBe(201);
            expect(addendumRes.body.success).toBe(true);
            expect(addendumRes.body.data.visit.addenda).toHaveLength(1);
            expect(addendumRes.body.data.visit.addenda[0].text).toBe(
                "Lab results arrived late: Hemoglobin normal."
            );
        });
    });

    describe("Vitals Validation Ranges", () => {
        it("rejects out-of-range vitals with 400 validation error", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent } = await loginAs("doctor", { doctorId: doctor.id });

            const invalidVitalsRes = await docAgent.post("/api/v1/visits").send({
                patientId: patient.id,
                chiefComplaint: "Fever",
                diagnosis: "Viral",
                notes: "Exam",
                vitals: {
                    bpSystolic: 450, // Max allowed is 250
                    temperatureC: 60, // Max allowed is 45
                },
            });

            expect(invalidVitalsRes.status).toBe(400);
            expect(invalidVitalsRes.body.errors).toBeDefined();
        });
    });

    describe("Appointment Enrichment with visitId", () => {
        it("includes visitId in GET /appointments/:id for admin and treating doctor, omits for staff and viewer", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: docAgent, user: docUser } = await loginAs("doctor", {
                doctorId: doctor.id,
            });

            const appt = await createTestAppointment(doctor.id, patient.id, docUser.id, {
                status: "completed",
            });

            const visit = await createTestVisit(doctor.id, patient.id, docUser.id, {
                appointmentId: appt._id,
            } as any);

            // Admin sees visitId
            const { agent: adminAgent } = await loginAs("admin");
            const adminRes = await adminAgent.get(`/api/v1/appointments/${appt.id}`);
            expect(adminRes.status).toBe(200);
            expect(adminRes.body.data.appointment.visitId).toBe(visit.id);

            // Treating doctor sees visitId
            const docRes = await docAgent.get(`/api/v1/appointments/${appt.id}`);
            expect(docRes.status).toBe(200);
            expect(docRes.body.data.appointment.visitId).toBe(visit.id);

            // Staff does NOT see visitId (clinical content is least-privilege)
            const { agent: staffAgent } = await loginAs("staff");
            const staffRes = await staffAgent.get(`/api/v1/appointments/${appt.id}`);
            expect(staffRes.status).toBe(200);
            expect(staffRes.body.data.appointment.visitId).toBeUndefined();

            // Viewer does NOT see visitId
            const { agent: viewerAgent } = await loginAs("viewer");
            const viewerRes = await viewerAgent.get(`/api/v1/appointments/${appt.id}`);
            expect(viewerRes.status).toBe(200);
            expect(viewerRes.body.data.appointment.visitId).toBeUndefined();
        });
    });
});
