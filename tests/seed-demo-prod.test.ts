import { describe, it, expect } from "vitest";
import { User } from "../src/modules/users/user.model.js";
import { Doctor } from "../src/modules/doctors/doctor.model.js";
import { Patient } from "../src/modules/patients/patient.model.js";
import { Appointment } from "../src/modules/appointments/appointment.model.js";
import { Visit } from "../src/modules/visits/visit.model.js";
import { runDemoSeed } from "../src/scripts/seed-demo.js";
import {
    runDemoProdSeed,
    validateDemoProdEnv,
} from "../src/scripts/seed-demo-prod.js";
import { comparePassword } from "../src/utils/password.js";

describe("Demo Seeding - Production Guards and Rules", () => {
    describe("seed-demo.ts (standard non-production demo seed)", () => {
        it("unconditionally refuses to run in production", async () => {
            await expect(
                runDemoSeed({ nodeEnv: "production", disconnectOnComplete: false })
            ).rejects.toThrow(/FATAL: Seed execution refused\. NODE_ENV is set to production/);
        });
    });

    describe("seed-demo-prod.ts refusal conditions", () => {
        const validOptions = {
            nodeEnv: "production",
            allowDemoSeed: true,
            adminEmail: "admin@prod-demo.test",
            adminPassword: "StrongAdminPassword123!",
            demoViewerEmail: "viewer@prod-demo.test",
            demoViewerPassword: "StrongViewerPassword123!",
            disconnectOnComplete: false,
        };

        it("refuses to run in production when ALLOW_DEMO_SEED is false", () => {
            expect(() =>
                validateDemoProdEnv({
                    ...validOptions,
                    allowDemoSeed: false,
                })
            ).toThrow(/Demo seed in production is disabled\. Set ALLOW_DEMO_SEED=true/);
        });

        it("refuses to run when ADMIN_PASSWORD is missing", () => {
            expect(() =>
                validateDemoProdEnv({
                    ...validOptions,
                    adminPassword: "",
                })
            ).toThrow(/ADMIN_PASSWORD is required/);
        });

        it("refuses to run when ADMIN_PASSWORD is shorter than 12 characters", () => {
            expect(() =>
                validateDemoProdEnv({
                    ...validOptions,
                    adminPassword: "Short123!",
                })
            ).toThrow(/ADMIN_PASSWORD must be at least 12 characters long/);
        });

        it("refuses to run when ADMIN_PASSWORD is equal to 'Password123!'", () => {
            expect(() =>
                validateDemoProdEnv({
                    ...validOptions,
                    adminPassword: "Password123!",
                })
            ).toThrow(/ADMIN_PASSWORD cannot be the default insecure password 'Password123!'/);
        });

        it("refuses to run when DEMO_VIEWER_EMAIL or DEMO_VIEWER_PASSWORD is missing", () => {
            expect(() =>
                validateDemoProdEnv({
                    ...validOptions,
                    demoViewerEmail: "",
                })
            ).toThrow(/DEMO_VIEWER_EMAIL and DEMO_VIEWER_PASSWORD are required/);

            expect(() =>
                validateDemoProdEnv({
                    ...validOptions,
                    demoViewerPassword: "",
                })
            ).toThrow(/DEMO_VIEWER_EMAIL and DEMO_VIEWER_PASSWORD are required/);
        });

        it("passes validation when all production requirements are satisfied", () => {
            expect(() => validateDemoProdEnv(validOptions)).not.toThrow();
        });
    });

    describe("runDemoProdSeed execution", () => {
        it("seeds demo data with only admin and read-only viewer accounts (no staff/doctor accounts)", async () => {
            const adminPassword = "SuperSecureAdminPassword2026!";
            const viewerPassword = "ViewerSecurePassword2026!";

            const result = await runDemoProdSeed({
                nodeEnv: "production",
                allowDemoSeed: true,
                adminEmail: "prod-admin@example.com",
                adminName: "Prod Admin User",
                adminPassword,
                demoViewerEmail: "prod-viewer@example.com",
                demoViewerPassword: viewerPassword,
                allowSeedReset: true,
                disconnectOnComplete: false,
            });

            expect(result.adminEmail).toBe("prod-admin@example.com");
            expect(result.viewerEmail).toBe("prod-viewer@example.com");
            expect(result.doctorsCount).toBeGreaterThan(0);
            expect(result.patientsCount).toBeGreaterThan(0);
            expect(result.appointmentCount).toBeGreaterThan(0);
            expect(result.visitCount).toBeGreaterThan(0);

            // Verify Users collection
            const allUsers = await User.find({}).select("+passwordHash");
            expect(allUsers).toHaveLength(2);

            const adminUser = allUsers.find((u) => u.email === "prod-admin@example.com");
            expect(adminUser).toBeDefined();
            expect(adminUser?.role).toBe("admin");
            expect(adminUser?.isActive).toBe(true);
            const isAdminPasswordValid = await comparePassword(
                adminPassword,
                adminUser!.passwordHash
            );
            expect(isAdminPasswordValid).toBe(true);

            const viewerUser = allUsers.find((u) => u.email === "prod-viewer@example.com");
            expect(viewerUser).toBeDefined();
            expect(viewerUser?.role).toBe("viewer");
            expect(viewerUser?.isActive).toBe(true);
            const isViewerPasswordValid = await comparePassword(
                viewerPassword,
                viewerUser!.passwordHash
            );
            expect(isViewerPasswordValid).toBe(true);

            // Crucial security requirement: MUST NOT create staff or doctor accounts with known passwords
            const doctorUsers = await User.find({ role: "doctor" });
            expect(doctorUsers).toHaveLength(0);

            const staffUsers = await User.find({ role: "staff" });
            expect(staffUsers).toHaveLength(0);

            // Verify doctors, patients, appointments, visits were created in their own collections
            const doctors = await Doctor.find({});
            expect(doctors.length).toBe(result.doctorsCount);

            const patients = await Patient.find({});
            expect(patients.length).toBe(result.patientsCount);

            const appointments = await Appointment.find({});
            expect(appointments.length).toBe(result.appointmentCount);

            const visits = await Visit.find({});
            expect(visits.length).toBe(result.visitCount);
        });
    });
});
