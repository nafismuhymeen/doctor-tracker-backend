import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { loginAs } from "./helpers/auth.js";
import { createTestDoctor, createTestPatient } from "./helpers/factories.js";
import { AuditLog } from "../src/modules/audit/audit.model.js";

describe("Platform Hardening & Delivery (Phase 5)", () => {
    describe("Operations & Readiness Check (/api/v1/ready)", () => {
        it("returns 200 ready when database is connected and ping succeeds", async () => {
            const res = await request(app).get("/api/v1/ready");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.status).toBe("ready");
            expect(res.body.message).toContain("ready to accept traffic");
        });

        it("returns 200 on liveness probe /api/v1/health", async () => {
            const res = await request(app).get("/api/v1/health");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe("Doctor Tracker API is running");
        });
    });

    describe("Request Payload Limiting (100kb)", () => {
        it("rejects request bodies larger than 100kb with 413 Payload Too Large", async () => {
            const { agent } = await loginAs("admin");
            // Create a payload larger than 100kb
            const largeString = "a".repeat(120 * 1024);

            const res = await agent
                .post("/api/v1/doctors")
                .send({ largeData: largeString });

            expect(res.status).toBe(413);
        });
    });

    describe("OpenAPI 3.1 & Swagger UI Documentation", () => {
        it("serves the raw OpenAPI 3.1 specification at /api/openapi.json", async () => {
            const res = await request(app).get("/api/openapi.json");
            expect(res.status).toBe(200);
            expect(res.body.openapi).toBe("3.1.0");
            expect(res.body.info.title).toBe("Doctor Tracker API");
            expect(res.body.components.securitySchemes.cookieAuth).toBeDefined();
            expect(res.body.paths["/auth/login"]).toBeDefined();
            expect(res.body.paths["/doctors"]).toBeDefined();
            expect(res.body.paths["/patients"]).toBeDefined();
            expect(res.body.paths["/appointments"]).toBeDefined();
            expect(res.body.paths["/visits"]).toBeDefined();
            expect(res.body.paths["/audit"]).toBeDefined();
            expect(res.body.paths["/ready"]).toBeDefined();
        });

        it("serves Swagger UI at /api/docs", async () => {
            const res = await request(app).get("/api/docs/");
            expect(res.status).toBe(200);
            expect(res.text).toContain("swagger-ui");
        });
    });

    describe("Domain Service Coverage Hardening", () => {
        it("supports audit log date range filtering (from and to) and rejects invalid IDs", async () => {
            const { agent } = await loginAs("admin");

            const now = new Date();
            const pastDate = new Date(now.getTime() - 3600 * 1000);
            const futureDate = new Date(now.getTime() + 3600 * 1000);

            await AuditLog.create({
                action: "audit.date.test",
                entityType: "System",
                outcome: "success",
            });

            // Filter with date range
            const resRange = await agent.get(
                `/api/v1/audit?from=${pastDate.toISOString()}&to=${futureDate.toISOString()}`
            );
            expect(resRange.status).toBe(200);
            expect(resRange.body.data.logs.length).toBeGreaterThan(0);

            // Fetch invalid audit log ID -> 404
            const resInvalid = await agent.get("/api/v1/audit/not-a-valid-id");
            expect(resInvalid.status).toBe(404);
        });

        it("allows deleting doctor with patient reassignment to another active doctor", async () => {
            const { agent: adminAgent } = await loginAs("admin");

            const docA = await createTestDoctor({ name: "Dr. Delete Target" });
            const docB = await createTestDoctor({ name: "Dr. Reassignment Target" });

            const patient = await createTestPatient(docA.id);

            // Attempting delete without reassignToDoctorId fails with 400
            const failRes = await adminAgent.delete(`/api/v1/doctors/${docA.id}`);
            expect(failRes.status).toBe(400);

            // Delete with valid reassignToDoctorId succeeds
            const successRes = await adminAgent.delete(
                `/api/v1/doctors/${docA.id}?reassignToDoctorId=${docB.id}`
            );
            expect(successRes.status).toBe(200);
            expect(successRes.body.data.reassignedPatientsCount).toBe(1);

            // Verify patient is now assigned to docB
            const { Patient } = await import("../src/modules/patients/patient.model.js");
            const updatedPatient = await Patient.findById(patient.id);
            expect(updatedPatient?.doctorId.toString()).toBe(docB.id);
        });

        it("supports doctor listing with date range filters and patient deletion under doctor", async () => {
            const { agent: adminAgent } = await loginAs("admin");

            const doc = await createTestDoctor();
            const patient = await createTestPatient(doc.id);

            // Doctor list with date filters
            const dateRes = await adminAgent.get(
                "/api/v1/doctors?startDate=2020-01-01&endDate=2030-01-01"
            );
            expect(dateRes.status).toBe(200);

            // Delete patient under doctor
            const delRes = await adminAgent.delete(
                `/api/v1/doctors/${doc.id}/patients/${patient.id}`
            );
            expect(delRes.status).toBe(200);
            expect(delRes.body.success).toBe(true);

            // Error paths in deleteUnderDoctor
            const { patientService } = await import("../src/modules/patients/patient.service.js");
            await expect(patientService.deleteUnderDoctor("invalid-id", patient.id)).rejects.toThrow();
            await expect(patientService.deleteUnderDoctor(doc.id, "invalid-id")).rejects.toThrow();
            await expect(
                patientService.deleteUnderDoctor(new mongoose.Types.ObjectId().toString(), patient.id)
            ).rejects.toThrow();
            await expect(
                patientService.deleteUnderDoctor(doc.id, new mongoose.Types.ObjectId().toString())
            ).rejects.toThrow();
        });
    });
});

