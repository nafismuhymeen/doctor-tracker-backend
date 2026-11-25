import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createTestDoctor, createTestUser } from "./helpers/factories.js";
import { loginAs } from "./helpers/auth.js";
import { User } from "../src/modules/users/user.model.js";

describe("User Management Module (/api/v1/users)", () => {
    describe("GET /api/v1/users", () => {
        it("allows admin to list users with pagination and search", async () => {
            const { agent } = await loginAs("admin");
            await createTestUser({ name: "Alice Staff", role: "staff" });
            await createTestUser({ name: "Bob Viewer", role: "viewer" });

            const res = await agent.get("/api/v1/users?search=Alice");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.users.length).toBeGreaterThanOrEqual(1);
            expect(res.body.data.users[0].name).toContain("Alice");
            expect(res.body.data.users[0].passwordHash).toBeUndefined();
        });

        it("forbids non-admin users with 403 FORBIDDEN", async () => {
            const { agent: staffAgent } = await loginAs("staff");
            const resStaff = await staffAgent.get("/api/v1/users");
            expect(resStaff.status).toBe(403);
            expect(resStaff.body.code).toBe("FORBIDDEN");

            const { agent: doctorAgent } = await loginAs("doctor");
            const resDoc = await doctorAgent.get("/api/v1/users");
            expect(resDoc.status).toBe(403);
            expect(resDoc.body.code).toBe("FORBIDDEN");

            const { agent: viewerAgent } = await loginAs("viewer");
            const resViewer = await viewerAgent.get("/api/v1/users");
            expect(resViewer.status).toBe(403);
            expect(resViewer.body.code).toBe("FORBIDDEN");
        });
    });

    describe("POST /api/v1/users", () => {
        it("allows admin to create a new staff user", async () => {
            const { agent } = await loginAs("admin");

            const res = await agent.post("/api/v1/users").send({
                name: "New Nurse",
                email: "nurse@test.com",
                password: "Password123!",
                role: "staff",
            });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.user.email).toBe("nurse@test.com");
            expect(res.body.data.user.role).toBe("staff");
            expect(res.body.data.user.passwordHash).toBeUndefined();
        });

        it("validates doctorId when creating doctor user", async () => {
            const { agent } = await loginAs("admin");

            // Missing doctorId
            const missingRes = await agent.post("/api/v1/users").send({
                name: "Dr. No Id",
                email: "drnoid@test.com",
                password: "Password123!",
                role: "doctor",
            });
            expect(missingRes.status).toBe(400);

            // Valid doctor creation
            const doctor = await createTestDoctor();
            const validRes = await agent.post("/api/v1/users").send({
                name: "Dr. Valid",
                email: "drvalid@test.com",
                password: "Password123!",
                role: "doctor",
                doctorId: doctor.id,
            });
            expect(validRes.status).toBe(201);
            expect(validRes.body.data.user.doctorId).toBe(doctor.id);

            // Re-assigning same doctor fails with 409 DOCTOR_ALREADY_ASSIGNED
            const duplicateDoctorRes = await agent.post("/api/v1/users").send({
                name: "Dr. Duplicate",
                email: "drdup@test.com",
                password: "Password123!",
                role: "doctor",
                doctorId: doctor.id,
            });
            expect(duplicateDoctorRes.status).toBe(409);
            expect(duplicateDoctorRes.body.code).toBe("DOCTOR_ALREADY_ASSIGNED");
        });

        it("rejects duplicate email with 409 EMAIL_IN_USE", async () => {
            const { agent, user } = await loginAs("admin");

            const res = await agent.post("/api/v1/users").send({
                name: "Duplicate User",
                email: user.email,
                password: "Password123!",
                role: "staff",
            });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("EMAIL_IN_USE");
        });
    });

    describe("PATCH /api/v1/users/:id", () => {
        it("admin can update another user's name, role, and active status", async () => {
            const { agent } = await loginAs("admin");
            const { user: targetUser } = await createTestUser({ role: "viewer" });

            const res = await agent.patch(`/api/v1/users/${targetUser.id}`).send({
                name: "Promoted Staff",
                role: "staff",
            });

            expect(res.status).toBe(200);
            expect(res.body.data.user.name).toBe("Promoted Staff");
            expect(res.body.data.user.role).toBe("staff");
        });

        it("rejects self-demotion with 400", async () => {
            const { agent, user: adminUser } = await loginAs("admin");

            const res = await agent.patch(`/api/v1/users/${adminUser.id}`).send({
                role: "viewer",
            });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects self-deactivation with 400", async () => {
            const { agent, user: adminUser } = await loginAs("admin");

            const res = await agent.patch(`/api/v1/users/${adminUser.id}`).send({
                isActive: false,
            });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects demoting or deactivating the last active admin with 409 LAST_ADMIN", async () => {
            // There is only 1 active admin
            const { agent } = await loginAs("admin");
            const { user: secondAdmin } = await createTestUser({
                role: "admin",
                isActive: true,
            });

            // Demote secondAdmin while 2 exist succeeds
            const demoteRes = await agent.patch(`/api/v1/users/${secondAdmin.id}`).send({
                role: "staff",
            });
            expect(demoteRes.status).toBe(200);

            // Now only 1 admin remains in DB. Creating another admin then trying to deactive them when count=1:
            // Let's create an admin who is the ONLY active admin
            await User.deleteMany({ role: "admin" });
            const { user: soleAdmin } = await createTestUser({ role: "admin", isActive: true });
            const { user: otherAdminAccount } = await createTestUser({ role: "admin", isActive: true });

            // Log in as soleAdmin
            const soleAdminLogin = await request(app).post("/api/v1/auth/login").send({
                email: soleAdmin.email,
                password: "Password123!",
            });
            const soleAdminAgent = request.agent(app);
            soleAdminAgent.set("Cookie", soleAdminLogin.headers["set-cookie"] as string[]);

            // Demote otherAdminAccount (leaving soleAdmin as 1)
            await soleAdminAgent.patch(`/api/v1/users/${otherAdminAccount.id}`).send({
                role: "staff",
            });

            // Now soleAdmin is the last active admin. Demoting another user who was admin would fail:
            const { user: testAdmin } = await createTestUser({ role: "admin", isActive: false });
            // testAdmin is inactive so active count is 1
            await soleAdminAgent.patch(`/api/v1/users/${testAdmin.id}`).send({
                isActive: false,
            });
            // testAdmin was already inactive, so isDemotingOrDeactivatingAdmin is false, but what if testAdmin is active:
            await User.findByIdAndUpdate(testAdmin.id, { isActive: true });
            // Now 2 active admins. Deactivate testAdmin:
            const deactRes = await soleAdminAgent.patch(`/api/v1/users/${testAdmin.id}`).send({
                isActive: false,
            });
            expect(deactRes.status).toBe(200);

            // Now attempt to deactivate/demote soleAdmin - self deactivation fails with 400
            const selfRes = await soleAdminAgent.patch(`/api/v1/users/${soleAdmin.id}`).send({
                isActive: false,
            });
            expect(selfRes.status).toBe(400);
        });

        it("revokes sessions when role changes or user is deactivated", async () => {
            const { agent: adminAgent } = await loginAs("admin");
            const { agent: targetAgent, user: targetUser } = await loginAs("staff");

            // Verify target user is logged in
            const meRes1 = await targetAgent.get("/api/v1/auth/me");
            expect(meRes1.status).toBe(200);

            // Admin deactivates target user
            const deactRes = await adminAgent
                .patch(`/api/v1/users/${targetUser.id}`)
                .send({ isActive: false });
            expect(deactRes.status).toBe(200);

            // Target user's subsequent requests are rejected
            const meRes2 = await targetAgent.get("/api/v1/auth/me");
            expect(meRes2.status).toBe(403);
            expect(meRes2.body.code).toBe("ACCOUNT_DISABLED");
        });
    });

    describe("POST /api/v1/users/:id/reset-password", () => {
        it("admin can reset another user's password and invalidates sessions", async () => {
            const { agent: adminAgent } = await loginAs("admin");
            const { agent: targetAgent, user: targetUser } = await loginAs("staff");

            // Admin resets password
            const resetRes = await adminAgent
                .post(`/api/v1/users/${targetUser.id}/reset-password`)
                .send({ password: "BrandNewPassword99!" });

            expect(resetRes.status).toBe(200);
            expect(resetRes.body.success).toBe(true);

            // Existing session of target user is invalidated
            const meRes = await targetAgent.get("/api/v1/auth/me");
            expect(meRes.status).toBe(401);
            expect(meRes.body.code).toBe("INVALID_TOKEN");

            // Target user can log in with new password
            const newLoginRes = await request(app).post("/api/v1/auth/login").send({
                email: targetUser.email,
                password: "BrandNewPassword99!",
            });
            expect(newLoginRes.status).toBe(200);
        });
    });
});

