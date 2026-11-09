import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createTestDoctor, createTestPatient } from "./helpers/factories.js";
import { loginAs } from "./helpers/auth.js";

describe("RBAC and Doctor Scoping Matrix", () => {
    describe("Doctor Management Endpoint Permissions", () => {
        it("allows admin to create doctor, but rejects staff, doctor, viewer with 403", async () => {
            const { agent: adminAgent } = await loginAs("admin");
            const createPayload = {
                name: "Dr. New Doc",
                specialization: "Cardiology",
                hospital: "Heart Clinic",
                email: "doc.cardio@test.com",
                phone: "+1122334455",
            };

            const adminRes = await adminAgent.post("/api/v1/doctors").send(createPayload);
            expect(adminRes.status).toBe(201);

            const { agent: staffAgent } = await loginAs("staff");
            const staffRes = await staffAgent.post("/api/v1/doctors").send(createPayload);
            expect(staffRes.status).toBe(403);
            expect(staffRes.body.code).toBe("FORBIDDEN");

            const { agent: docAgent } = await loginAs("doctor");
            const docRes = await docAgent.post("/api/v1/doctors").send(createPayload);
            expect(docRes.status).toBe(403);
            expect(docRes.body.code).toBe("FORBIDDEN");

            const { agent: viewerAgent } = await loginAs("viewer");
            const viewerRes = await viewerAgent.post("/api/v1/doctors").send(createPayload);
            expect(viewerRes.status).toBe(403);
            expect(viewerRes.body.code).toBe("FORBIDDEN");
        });

        it("allows admin to update doctor; rejects staff and viewer with 403, and doctor updating another doctor with 404", async () => {
            const doctor = await createTestDoctor();
            const { agent: adminAgent } = await loginAs("admin");
            const { agent: staffAgent } = await loginAs("staff");
            const { agent: doctorAgent } = await loginAs("doctor");
            const { agent: viewerAgent } = await loginAs("viewer");

            const updateData = { name: "Dr. Renamed" };

            const adminRes = await adminAgent.patch(`/api/v1/doctors/${doctor.id}`).send(updateData);
            expect(adminRes.status).toBe(200);

            const staffRes = await staffAgent.patch(`/api/v1/doctors/${doctor.id}`).send(updateData);
            expect(staffRes.status).toBe(403);

            const docRes = await doctorAgent.patch(`/api/v1/doctors/${doctor.id}`).send(updateData);
            expect(docRes.status).toBe(404);

            const viewerRes = await viewerAgent.patch(`/api/v1/doctors/${doctor.id}`).send(updateData);
            expect(viewerRes.status).toBe(403);
        });

        it("allows admin to delete doctor, rejects staff, doctor, viewer with 403", async () => {
            const doc1 = await createTestDoctor();
            const doc2 = await createTestDoctor();
            const doc3 = await createTestDoctor();
            const doc4 = await createTestDoctor();

            const { agent: staffAgent } = await loginAs("staff");
            const { agent: docAgent } = await loginAs("doctor");
            const { agent: viewerAgent } = await loginAs("viewer");
            const { agent: adminAgent } = await loginAs("admin");

            expect((await staffAgent.delete(`/api/v1/doctors/${doc1.id}`)).status).toBe(403);
            expect((await docAgent.delete(`/api/v1/doctors/${doc2.id}`)).status).toBe(403);
            expect((await viewerAgent.delete(`/api/v1/doctors/${doc3.id}`)).status).toBe(403);

            const adminRes = await adminAgent.delete(`/api/v1/doctors/${doc4.id}`);
            expect(adminRes.status).toBe(200);
        });

        it("allows admin, staff, doctor, viewer to read doctors list and single doctor", async () => {
            const doctor = await createTestDoctor();

            for (const role of ["admin", "staff", "doctor", "viewer"] as const) {
                const { agent } = await loginAs(role);

                const listRes = await agent.get("/api/v1/doctors");
                expect(listRes.status).toBe(200);
                expect(listRes.body.success).toBe(true);

                const singleRes = await agent.get(`/api/v1/doctors/${doctor.id}`);
                expect(singleRes.status).toBe(200);
                expect(singleRes.body.success).toBe(true);
            }
        });
    });

    describe("Patient Management Endpoint Permissions & Doctor Scoping", () => {
        it("viewer is forbidden from creating, updating, or deleting patients", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: viewerAgent } = await loginAs("viewer");

            // Create under doctor forbidden
            const createRes = await viewerAgent
                .post(`/api/v1/doctors/${doctor.id}/patients`)
                .send({
                    name: "New Patient",
                    age: 25,
                    gender: "female",
                    phone: "+1234567890",
                    condition: "Flu",
                });
            expect(createRes.status).toBe(403);

            // Update forbidden
            const updateRes = await viewerAgent
                .patch(`/api/v1/patients/${patient.id}`)
                .send({ name: "Viewer Edited" });
            expect(updateRes.status).toBe(403);

            // Delete forbidden
            const deleteRes = await viewerAgent.delete(`/api/v1/patients/${patient.id}`);
            expect(deleteRes.status).toBe(403);
        });

        it("doctor cannot delete patients", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent: doctorAgent } = await loginAs("doctor", { doctorId: doctor.id });

            const deleteRes = await doctorAgent.delete(`/api/v1/patients/${patient.id}`);
            expect(deleteRes.status).toBe(403);

            const deleteUnderDocRes = await doctorAgent.delete(
                `/api/v1/doctors/${doctor.id}/patients/${patient.id}`
            );
            expect(deleteUnderDocRes.status).toBe(403);
        });

        it("doctor role scoping: doctor can only read and update their own patients, returns 404 for other doctors' patients", async () => {
            const doctorA = await createTestDoctor({ name: "Dr. A" });
            const doctorB = await createTestDoctor({ name: "Dr. B" });

            const patientA = await createTestPatient(doctorA.id, { name: "Patient of Doc A" });
            const patientB = await createTestPatient(doctorB.id, { name: "Patient of Doc B" });

            const { agent: doctorAAgent } = await loginAs("doctor", { doctorId: doctorA.id });

            // 1. Reading own patient -> 200
            const ownRes = await doctorAAgent.get(`/api/v1/patients/${patientA.id}`);
            expect(ownRes.status).toBe(200);
            expect(ownRes.body.data.patient.name).toBe("Patient of Doc A");

            // 2. Reading other doctor's patient -> 404 (does NOT leak patient existence with 403)
            const otherRes = await doctorAAgent.get(`/api/v1/patients/${patientB.id}`);
            expect(otherRes.status).toBe(404);

            // 3. Updating own patient -> 200
            const updateOwnRes = await doctorAAgent
                .patch(`/api/v1/patients/${patientA.id}`)
                .send({ condition: "Recovered" });
            expect(updateOwnRes.status).toBe(200);

            // 4. Updating other doctor's patient -> 404
            const updateOtherRes = await doctorAAgent
                .patch(`/api/v1/patients/${patientB.id}`)
                .send({ condition: "Tampered" });
            expect(updateOtherRes.status).toBe(404);

            // 5. Creating patient under own doctor -> 201
            const createOwnRes = await doctorAAgent
                .post(`/api/v1/doctors/${doctorA.id}/patients`)
                .send({
                    name: "Doc A New Patient",
                    age: 40,
                    gender: "male",
                    phone: "+1112223334",
                    condition: "Hypertension",
                });
            expect(createOwnRes.status).toBe(201);

            // 6. Creating patient under other doctor -> 404
            const createOtherRes = await doctorAAgent
                .post(`/api/v1/doctors/${doctorB.id}/patients`)
                .send({
                    name: "Doc B Infiltrated Patient",
                    age: 40,
                    gender: "male",
                    phone: "+1112223335",
                    condition: "Diabetes",
                });
            expect(createOtherRes.status).toBe(404);

            // 7. Listing all patients implicitly scopes to doctorA's patients only
            const listRes = await doctorAAgent.get("/api/v1/patients");
            expect(listRes.status).toBe(200);
            const returnedPatientIds = listRes.body.data.patients.map((p: any) => p._id);
            expect(returnedPatientIds).toContain(patientA.id);
            expect(returnedPatientIds).not.toContain(patientB.id);

            // 8. Attempting to query another doctor's patients explicitly returns 404
            const explicitOtherListRes = await doctorAAgent.get(
                `/api/v1/doctors/${doctorB.id}/patients`
            );
            expect(explicitOtherListRes.status).toBe(404);
        });

        it("staff and admin have global scope over patients", async () => {
            const doctorA = await createTestDoctor();
            const doctorB = await createTestDoctor();

            const patientA = await createTestPatient(doctorA.id);
            const patientB = await createTestPatient(doctorB.id);

            for (const role of ["admin", "staff"] as const) {
                const { agent } = await loginAs(role);

                // Can read patientA and patientB
                const resA = await agent.get(`/api/v1/patients/${patientA.id}`);
                const resB = await agent.get(`/api/v1/patients/${patientB.id}`);
                expect(resA.status).toBe(200);
                expect(resB.status).toBe(200);

                // List contains both
                const list = await agent.get("/api/v1/patients");
                const ids = list.body.data.patients.map((p: any) => p._id);
                expect(ids).toContain(patientA.id);
                expect(ids).toContain(patientB.id);
            }
        });
    });

    describe("Dashboard Endpoint Permissions", () => {
        it("allows admin, staff, and viewer to access dashboard stats, but rejects doctor with 403", async () => {
            for (const role of ["admin", "staff", "viewer"] as const) {
                const { agent } = await loginAs(role);

                const statsRes = await agent.get("/api/v1/dashboard/stats");
                expect(statsRes.status).toBe(200);
                expect(statsRes.body.success).toBe(true);
            }

            const { agent: docAgent } = await loginAs("doctor");
            const docRes = await docAgent.get("/api/v1/dashboard/stats");
            expect(docRes.status).toBe(403);
            expect(docRes.body.code).toBe("FORBIDDEN");
        });

        it("rejects unauthenticated requests to dashboard with 401", async () => {
            const statsRes = await request(app).get("/api/v1/dashboard/stats");
            expect(statsRes.status).toBe(401);
            expect(statsRes.body.code).toBe("UNAUTHORIZED");
        });
    });

    describe("Audit Endpoint Permissions", () => {
        it("allows admin to access audit logs, but rejects staff, doctor, viewer with 403 and unauthenticated with 401", async () => {
            const { agent: adminAgent } = await loginAs("admin");
            const adminRes = await adminAgent.get("/api/v1/audit");
            expect(adminRes.status).toBe(200);

            for (const role of ["staff", "doctor", "viewer"] as const) {
                const { agent } = await loginAs(role);
                const res = await agent.get("/api/v1/audit");
                expect(res.status).toBe(403);
                expect(res.body.code).toBe("FORBIDDEN");
            }

            const unauthRes = await request(app).get("/api/v1/audit");
            expect(unauthRes.status).toBe(401);
            expect(unauthRes.body.code).toBe("UNAUTHORIZED");
        });
    });
});
