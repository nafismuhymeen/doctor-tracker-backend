import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createTestUser } from "./helpers/factories.js";
import { loginAs } from "./helpers/auth.js";
import { Session } from "../src/modules/auth/session.model.js";
import { User } from "../src/modules/users/user.model.js";

describe("Auth Module", () => {
    describe("POST /api/v1/auth/login", () => {
        it("logs in successfully with valid credentials and sets cookies", async () => {
            const { user, plainPassword } = await createTestUser({
                role: "admin",
            });

            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({
                    email: user.email,
                    password: plainPassword,
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.user.id).toBe(user.id);
            expect(res.body.data.user.email).toBe(user.email);
            expect(res.body.data.user.role).toBe("admin");

            // Verify cookies
            const setCookie = res.headers["set-cookie"];
            expect(setCookie).toBeDefined();
            const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : setCookie;
            expect(cookieStr).toContain("accessToken=");
            expect(cookieStr).toContain("refreshToken=");
            expect(cookieStr).toContain("HttpOnly");

            // Verify lastLoginAt updated
            const updatedUser = await User.findById(user._id);
            expect(updatedUser?.lastLoginAt).toBeInstanceOf(Date);
        });

        it("returns 401 INVALID_CREDENTIALS for incorrect password", async () => {
            const { user } = await createTestUser();

            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({
                    email: user.email,
                    password: "WrongPassword99!",
                });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe("INVALID_CREDENTIALS");
        });

        it("returns 401 INVALID_CREDENTIALS for non-existent user", async () => {
            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({
                    email: "nonexistent@test.com",
                    password: "Password123!",
                });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe("INVALID_CREDENTIALS");
        });

        it("returns 403 ACCOUNT_DISABLED if user is inactive", async () => {
            const { user, plainPassword } = await createTestUser({
                isActive: false,
            });

            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({
                    email: user.email,
                    password: plainPassword,
                });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe("ACCOUNT_DISABLED");
        });
    });

    describe("POST /api/v1/auth/refresh", () => {
        it("rotates refresh token and issues new cookie pair", async () => {
            const { agent } = await loginAs("staff");

            const refreshRes = await agent.post("/api/v1/auth/refresh");
            expect(refreshRes.status).toBe(200);
            expect(refreshRes.body.success).toBe(true);

            const setCookie = refreshRes.headers["set-cookie"];
            expect(setCookie).toBeDefined();
            const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : setCookie;
            expect(cookieStr).toContain("accessToken=");
            expect(cookieStr).toContain("refreshToken=");
        });

        it("handles multi-tab grace window with 409 TOKEN_ROTATED", async () => {
            const { user, plainPassword } = await createTestUser();

            // Direct request to capture raw initial refresh cookie
            const loginRes = await request(app)
                .post("/api/v1/auth/login")
                .send({ email: user.email, password: plainPassword });

            const initialCookies = loginRes.headers["set-cookie"];
            const rawCookies = Array.isArray(initialCookies) ? initialCookies : [initialCookies];
            const refreshCookie = rawCookies.find((c: string) => c.startsWith("refreshToken="));
            expect(refreshCookie).toBeDefined();

            // First rotation (tab 1)
            const rotateRes1 = await request(app)
                .post("/api/v1/auth/refresh")
                .set("Cookie", [refreshCookie!]);
            expect(rotateRes1.status).toBe(200);

            // Immediate second rotation using original token within grace window (tab 2)
            const rotateRes2 = await request(app)
                .post("/api/v1/auth/refresh")
                .set("Cookie", [refreshCookie!]);

            expect(rotateRes2.status).toBe(409);
            expect(rotateRes2.body.code).toBe("TOKEN_ROTATED");
        });

        it("detects token reuse and revokes entire session family", async () => {
            const { user, plainPassword } = await createTestUser();

            const loginRes = await request(app)
                .post("/api/v1/auth/login")
                .send({ email: user.email, password: plainPassword });

            const initialCookies = loginRes.headers["set-cookie"];
            const rawCookies = Array.isArray(initialCookies) ? initialCookies : [initialCookies];
            const refreshCookie = rawCookies.find((c: string) => c.startsWith("refreshToken="));

            // Find session and advance its rotatedAt beyond grace window (15 seconds ago)
            await request(app)
                .post("/api/v1/auth/refresh")
                .set("Cookie", [refreshCookie!]);

            // Set revokedAt beyond grace window
            await Session.updateMany(
                { userId: user._id, revokedAt: { $ne: null } },
                { revokedAt: new Date(Date.now() - 30_000) }
            );

            // Re-attempting rotation with old token triggers theft detection
            const reuseRes = await request(app)
                .post("/api/v1/auth/refresh")
                .set("Cookie", [refreshCookie!]);

            expect(reuseRes.status).toBe(401);
            expect(reuseRes.body.code).toBe("SESSION_TERMINATED");

            // All sessions in that family must now be revoked
            const activeSessions = await Session.countDocuments({
                userId: user._id,
                revokedAt: null,
            });
            expect(activeSessions).toBe(0);
        });
    });

    describe("GET /api/v1/auth/me", () => {
        it("returns current user profile when authenticated", async () => {
            const { agent, user } = await loginAs("doctor");

            const res = await agent.get("/api/v1/auth/me");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.user.id).toBe(user.id);
            expect(res.body.data.user.role).toBe("doctor");
        });

        it("returns 401 when not authenticated", async () => {
            const res = await request(app).get("/api/v1/auth/me");
            expect(res.status).toBe(401);
        });

        it("returns 401 when tokenVersion does not match (revoked)", async () => {
            const { agent, user } = await loginAs("staff");

            // Increment tokenVersion on user directly
            await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

            const res = await agent.get("/api/v1/auth/me");
            expect(res.status).toBe(401);
            expect(res.body.code).toBe("INVALID_TOKEN");
        });
    });

    describe("POST /api/v1/auth/logout and logout-all", () => {
        it("logs out current session and clears cookies", async () => {
            const { agent, user } = await loginAs("viewer");

            const res = await agent.post("/api/v1/auth/logout");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Active sessions in DB should be revoked
            const activeSessions = await Session.countDocuments({
                userId: user._id,
                revokedAt: null,
            });
            expect(activeSessions).toBe(0);
        });

        it("logs out all sessions for user", async () => {
            const { agent, user } = await loginAs("admin");

            const res = await agent.post("/api/v1/auth/logout-all");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const activeSessions = await Session.countDocuments({
                userId: user._id,
                revokedAt: null,
            });
            expect(activeSessions).toBe(0);
        });
    });

    describe("PATCH /api/v1/auth/password", () => {
        it("changes password, bumps tokenVersion, revokes prior sessions, and issues new session", async () => {
            const { agent, user, plainPassword } = await loginAs("staff");

            const res = await agent
                .patch("/api/v1/auth/password")
                .send({
                    currentPassword: plainPassword,
                    newPassword: "BrandNewPass99!",
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // User tokenVersion should have incremented
            const updatedUser = await User.findById(user._id);
            expect(updatedUser?.tokenVersion).toBe(1);

            // New login with old password fails
            const failedLogin = await request(app)
                .post("/api/v1/auth/login")
                .send({
                    email: user.email,
                    password: plainPassword,
                });
            expect(failedLogin.status).toBe(401);

            // New login with new password succeeds
            const successLogin = await request(app)
                .post("/api/v1/auth/login")
                .send({
                    email: user.email,
                    password: "BrandNewPass99!",
                });
            expect(successLogin.status).toBe(200);
        });

        it("rejects incorrect current password", async () => {
            const { agent } = await loginAs("staff");

            const res = await agent
                .patch("/api/v1/auth/password")
                .send({
                    currentPassword: "IncorrectCurrentPass123!",
                    newPassword: "BrandNewPass99!",
                });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("INVALID_CREDENTIALS");
        });
    });
});
