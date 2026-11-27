import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createTestUser } from "./helpers/factories.js";
import { loginAs } from "./helpers/auth.js";
import { Session } from "../src/modules/auth/session.model.js";
import { User } from "../src/modules/users/user.model.js";
import { AuditLog } from "../src/modules/audit/audit.model.js";
import * as passwordUtils from "../src/utils/password.js";

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

        describe("Account-Level Brute-Force Protection", () => {
            it("locks account after 5 failed attempts and records audit event", async () => {
                const { user } = await createTestUser();

                for (let i = 1; i <= 4; i++) {
                    const res = await request(app)
                        .post("/api/v1/auth/login")
                        .send({ email: user.email, password: "WrongPassword!" });

                    expect(res.status).toBe(401);
                    const dbUser = await User.findById(user._id);
                    expect(dbUser?.failedLoginAttempts).toBe(i);
                    expect(dbUser?.lockedUntil).toBeNull();
                }

                // 5th attempt locks the account
                const fifthRes = await request(app)
                    .post("/api/v1/auth/login")
                    .send({ email: user.email, password: "WrongPassword!" });

                expect(fifthRes.status).toBe(401);
                const lockedUser = await User.findById(user._id);
                expect(lockedUser?.failedLoginAttempts).toBe(5);
                expect(lockedUser?.lockedUntil).toBeInstanceOf(Date);
                expect(lockedUser!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

                // Verify audit log for lock
                const lockAudit = await AuditLog.findOne({
                    action: "user.lock",
                    entityId: user.id,
                });
                expect(lockAudit).toBeDefined();
                expect(lockAudit?.action).toBe("user.lock");
            });

            it("returns identical 401 response while locked without checking password", async () => {
                const { user, plainPassword } = await createTestUser();

                // 1st attempt failure
                const firstRes = await request(app)
                    .post("/api/v1/auth/login")
                    .send({ email: user.email, password: "WrongPassword!" });

                // Trigger 4 more failures to reach 5
                for (let i = 0; i < 4; i++) {
                    await request(app)
                        .post("/api/v1/auth/login")
                        .send({ email: user.email, password: "WrongPassword!" });
                }

                // 6th attempt (while locked)
                const compareSpy = vi.spyOn(passwordUtils, "comparePassword");
                const lockedRes = await request(app)
                    .post("/api/v1/auth/login")
                    .send({ email: user.email, password: plainPassword });

                // Response must be identical to wrong password
                expect(lockedRes.status).toBe(firstRes.status);
                expect(lockedRes.body).toEqual(firstRes.body);
                expect(lockedRes.body.code).toBe("INVALID_CREDENTIALS");
                expect(lockedRes.body.message).toBe("Invalid email or password");

                // comparePassword must NOT have been called while locked
                expect(compareSpy).not.toHaveBeenCalled();
                compareSpy.mockRestore();
            });

            it("runs dummy bcrypt compare for non-existent emails to prevent timing attacks", async () => {
                const compareSpy = vi.spyOn(passwordUtils, "comparePassword");

                const res = await request(app)
                    .post("/api/v1/auth/login")
                    .send({
                        email: "completely-unknown-user@test.com",
                        password: "SomePassword123!",
                    });

                expect(res.status).toBe(401);
                expect(res.body.code).toBe("INVALID_CREDENTIALS");
                expect(compareSpy).toHaveBeenCalled();
                compareSpy.mockRestore();
            });

            it("resets failedLoginAttempts counter on successful login", async () => {
                const { user, plainPassword } = await createTestUser();

                // Fail 3 times
                for (let i = 0; i < 3; i++) {
                    await request(app)
                        .post("/api/v1/auth/login")
                        .send({ email: user.email, password: "WrongPassword!" });
                }

                const failedUser = await User.findById(user._id);
                expect(failedUser?.failedLoginAttempts).toBe(3);

                // Now log in successfully with correct password
                const successRes = await request(app)
                    .post("/api/v1/auth/login")
                    .send({ email: user.email, password: plainPassword });

                expect(successRes.status).toBe(200);

                const resetUser = await User.findById(user._id);
                expect(resetUser?.failedLoginAttempts).toBe(0);
                expect(resetUser?.lockedUntil).toBeNull();
            });

            it("allows login after 15 minutes lockout expiry using fake timers", async () => {
                const { user, plainPassword } = await createTestUser();

                // Lock the account with 5 failed attempts
                for (let i = 0; i < 5; i++) {
                    await request(app)
                        .post("/api/v1/auth/login")
                        .send({ email: user.email, password: "WrongPassword!" });
                }

                const lockedUser = await User.findById(user._id);
                expect(lockedUser?.lockedUntil).toBeInstanceOf(Date);

                // Use fake timers to advance beyond 15 minutes
                vi.useFakeTimers();
                const futureTime = new Date(Date.now() + 15 * 60 * 1000 + 1000);
                vi.setSystemTime(futureTime);

                try {
                    const loginRes = await request(app)
                        .post("/api/v1/auth/login")
                        .send({ email: user.email, password: plainPassword });

                    expect(loginRes.status).toBe(200);
                    expect(loginRes.body.success).toBe(true);

                    const unlockedUser = await User.findById(user._id);
                    expect(unlockedUser?.failedLoginAttempts).toBe(0);
                    expect(unlockedUser?.lockedUntil).toBeNull();

                    // Verify unlock audit log recorded
                    const unlockAudit = await AuditLog.findOne({
                        action: "user.unlock",
                        entityId: user.id,
                    });
                    expect(unlockAudit).toBeDefined();
                } finally {
                    vi.useRealTimers();
                }
            });

            it("allows admin to unlock a locked account via PATCH /api/v1/users/:id", async () => {
                const { user, plainPassword } = await createTestUser({ role: "staff" });

                // Lock user with 5 failed attempts
                for (let i = 0; i < 5; i++) {
                    await request(app)
                        .post("/api/v1/auth/login")
                        .send({ email: user.email, password: "WrongPassword!" });
                }

                const lockedUser = await User.findById(user._id);
                expect(lockedUser?.failedLoginAttempts).toBe(5);
                expect(lockedUser?.lockedUntil).toBeInstanceOf(Date);

                // Admin unlocks user
                const { agent: adminAgent } = await loginAs("admin");
                const patchRes = await adminAgent
                    .patch(`/api/v1/users/${user.id}`)
                    .send({ unlock: true });

                expect(patchRes.status).toBe(200);

                const unlockedUser = await User.findById(user._id);
                expect(unlockedUser?.failedLoginAttempts).toBe(0);
                expect(unlockedUser?.lockedUntil).toBeNull();

                // Verify unlock audit log created
                const unlockAudit = await AuditLog.findOne({
                    action: "user.unlock",
                    entityId: user.id,
                });
                expect(unlockAudit).toBeDefined();

                // User can now log in immediately
                const loginRes = await request(app)
                    .post("/api/v1/auth/login")
                    .send({ email: user.email, password: plainPassword });

                expect(loginRes.status).toBe(200);
                expect(loginRes.body.success).toBe(true);
            });
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

        it("concurrency race: parallel /auth/refresh calls with identical token yield exactly one 200 and one 409", async () => {
            const { user, plainPassword } = await createTestUser();

            const loginRes = await request(app)
                .post("/api/v1/auth/login")
                .send({ email: user.email, password: plainPassword });

            const initialCookies = loginRes.headers["set-cookie"];
            const rawCookies = Array.isArray(initialCookies) ? initialCookies : [initialCookies];
            const refreshCookie = rawCookies.find((c: string) => c.startsWith("refreshToken="));
            expect(refreshCookie).toBeDefined();

            // Fire two parallel refresh calls with the exact same cookie
            const [res1, res2] = await Promise.all([
                request(app).post("/api/v1/auth/refresh").set("Cookie", [refreshCookie!]),
                request(app).post("/api/v1/auth/refresh").set("Cookie", [refreshCookie!]),
            ]);

            const statuses = [res1.status, res2.status].sort();
            expect(statuses).toEqual([200, 409]);

            const errorRes = res1.status === 409 ? res1 : res2;
            expect(errorRes.body.code).toBe("TOKEN_ROTATED");
        });

        it("rejects refresh when user's tokenVersion has changed", async () => {
            const { user, plainPassword } = await createTestUser();

            const loginRes = await request(app)
                .post("/api/v1/auth/login")
                .send({ email: user.email, password: plainPassword });

            const initialCookies = loginRes.headers["set-cookie"];
            const rawCookies = Array.isArray(initialCookies) ? initialCookies : [initialCookies];
            const refreshCookie = rawCookies.find((c: string) => c.startsWith("refreshToken="));
            expect(refreshCookie).toBeDefined();

            // Increment user's tokenVersion in DB
            await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

            const refreshRes = await request(app)
                .post("/api/v1/auth/refresh")
                .set("Cookie", [refreshCookie!]);

            expect(refreshRes.status).toBe(401);
            expect(refreshRes.body.code).toBe("SESSION_REVOKED");
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
