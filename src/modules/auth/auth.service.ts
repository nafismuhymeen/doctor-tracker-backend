import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import { User } from "../users/user.model.js";
import { Session } from "./session.model.js";
import { ApiError } from "../../utils/api-error.js";
import { comparePassword, hashPassword } from "../../utils/password.js";
import { env } from "../../config/env.js";
import { auditService } from "../audit/audit.service.js";

import type { ChangePasswordInput, LoginInput } from "./auth.schema.js";

// Pre-computed dummy hash to defend against timing attacks when user is not found
const DUMMY_HASH = "$2b$10$w82tZ0U47H5n50E463Yt..u9Xm6F/N7m4hV5V0o7kH7A0/8aG6YmC";

export function hashRefreshToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken(): string {
    return crypto.randomBytes(48).toString("base64url");
}

export function generateAccessToken(userId: string, tokenVersion: number): string {
    return jwt.sign(
        { sub: userId, tv: tokenVersion },
        env.JWT_SECRET,
        { expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m` }
    );
}

interface RequestMeta {
    userAgent?: string;
    ip?: string;
}

class AuthService {
    async login(input: LoginInput, meta: RequestMeta = {}) {
        const { email, password } = input;

        // Query user and explicitly select passwordHash
        const user = await User.findOne({ email }).select("+passwordHash");

        if (!user) {
            // Timing-safe dummy compare
            await comparePassword(password, DUMMY_HASH);
            await auditService.record({
                action: "auth.login.failure",
                entityType: "Auth",
                entityId: email,
                outcome: "failure",
                reason: "Invalid email or password",
                actor: { email },
            });
            throw new ApiError(
                "Invalid email or password",
                401,
                true,
                "INVALID_CREDENTIALS"
            );
        }

        if (!user.isActive) {
            await auditService.record({
                action: "auth.login.failure",
                entityType: "Auth",
                entityId: user.id,
                outcome: "failure",
                reason: "Account disabled",
                actor: { id: user.id, role: user.role, email: user.email },
            });
            throw new ApiError(
                "Your account has been disabled",
                403,
                true,
                "ACCOUNT_DISABLED"
            );
        }

        const isPasswordValid = await comparePassword(
            password,
            user.passwordHash
        );

        if (!isPasswordValid) {
            await auditService.record({
                action: "auth.login.failure",
                entityType: "Auth",
                entityId: user.id,
                outcome: "failure",
                reason: "Invalid email or password",
                actor: { id: user.id, role: user.role, email: user.email },
            });
            throw new ApiError(
                "Invalid email or password",
                401,
                true,
                "INVALID_CREDENTIALS"
            );
        }

        // Update last login timestamp
        user.lastLoginAt = new Date();
        await user.save();

        // Create new session family
        const familyId = crypto.randomUUID();
        const refreshToken = generateRefreshToken();
        const tokenHash = hashRefreshToken(refreshToken);

        const now = Date.now();
        const familyExpiresAt = new Date(
            now + env.SESSION_MAX_DAYS * 24 * 60 * 60 * 1000
        );
        const refreshLifetimeMs =
            env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
        const sessionExpiresAt = new Date(
            Math.min(now + refreshLifetimeMs, familyExpiresAt.getTime())
        );

        await Session.create({
            userId: user._id,
            familyId,
            tokenHash,
            expiresAt: sessionExpiresAt,
            familyExpiresAt,
            userAgent: meta.userAgent || "",
            ip: meta.ip || "",
        });

        const accessToken = generateAccessToken(user.id, user.tokenVersion);

        await auditService.record({
            action: "auth.login.success",
            entityType: "Auth",
            entityId: user.id,
            outcome: "success",
            actor: { id: user.id, role: user.role, email: user.email },
        });

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                doctorId: user.doctorId ? user.doctorId.toString() : undefined,
            },
            accessToken,
            refreshToken,
            refreshExpiresAt: sessionExpiresAt,
        };
    }

    async refresh(refreshToken: string, meta: RequestMeta = {}) {
        if (!refreshToken) {
            throw new ApiError(
                "Refresh token is required",
                401,
                true,
                "SESSION_REVOKED"
            );
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const session = await Session.findOne({ tokenHash });

        if (!session) {
            throw new ApiError(
                "Session not found or invalid",
                401,
                true,
                "SESSION_REVOKED"
            );
        }

        const now = new Date();

        // Check if session was already revoked (potential token reuse)
        if (session.revokedAt) {
            const elapsedMs = now.getTime() - session.revokedAt.getTime();
            const graceMs = env.REFRESH_REUSE_GRACE_SECONDS * 1000;

            if (elapsedMs <= graceMs) {
                // Benign multi-tab race condition: token already rotated
                throw new ApiError(
                    "Token was recently rotated",
                    409,
                    true,
                    "TOKEN_ROTATED"
                );
            }

            // Reuse detected outside grace window: token theft! Revoke whole family!
            await Session.updateMany(
                { familyId: session.familyId, revokedAt: null },
                { revokedAt: now }
            );

            await auditService.record({
                action: "auth.refresh.reuse_detected",
                entityType: "Auth",
                entityId: session.userId.toString(),
                outcome: "failure",
                reason: `Token reuse detected for family ${session.familyId}`,
                actor: { id: session.userId.toString() },
            });

            throw new ApiError(
                "Session reuse detected. All sessions in this family have been revoked.",
                401,
                true,
                "SESSION_TERMINATED"
            );
        }

        // Check expiration
        if (session.expiresAt <= now || session.familyExpiresAt <= now) {
            session.revokedAt = now;
            await session.save();
            throw new ApiError("Session has expired", 401, true, "SESSION_REVOKED");
        }

        const user = await User.findById(session.userId);

        if (!user || !user.isActive) {
            session.revokedAt = now;
            await session.save();
            throw new ApiError(
                "User account is inactive or not found",
                401,
                true,
                "SESSION_REVOKED"
            );
        }

        // Generate new refresh token in same family
        const newRefreshToken = generateRefreshToken();
        const newHash = hashRefreshToken(newRefreshToken);

        // Mark current session revoked and replaced
        session.revokedAt = now;
        session.replacedByHash = newHash;
        await session.save();

        const refreshLifetimeMs =
            env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
        const newExpiresAt = new Date(
            Math.min(
                now.getTime() + refreshLifetimeMs,
                session.familyExpiresAt.getTime()
            )
        );

        await Session.create({
            userId: user._id,
            familyId: session.familyId,
            tokenHash: newHash,
            expiresAt: newExpiresAt,
            familyExpiresAt: session.familyExpiresAt,
            userAgent: meta.userAgent || session.userAgent,
            ip: meta.ip || session.ip,
        });

        const newAccessToken = generateAccessToken(user.id, user.tokenVersion);

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                doctorId: user.doctorId ? user.doctorId.toString() : undefined,
            },
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            refreshExpiresAt: newExpiresAt,
        };
    }

    async logout(refreshToken?: string) {
        if (!refreshToken) {
            return;
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const session = await Session.findOne({ tokenHash });
        await Session.updateOne(
            { tokenHash, revokedAt: null },
            { revokedAt: new Date() }
        );

        await auditService.record({
            action: "auth.logout",
            entityType: "Auth",
            entityId: session?.userId ? session.userId.toString() : undefined,
            outcome: "success",
            actor: session?.userId ? { id: session.userId.toString() } : undefined,
        });
    }

    async logoutAll(userId: string) {
        await Session.updateMany(
            { userId, revokedAt: null },
            { revokedAt: new Date() }
        );

        await auditService.record({
            action: "auth.logout_all",
            entityType: "Auth",
            entityId: userId,
            outcome: "success",
            actor: { id: userId },
        });
    }

    async getCurrentUser(userId: string) {
        const user = await User.findById(userId);

        if (!user) {
            throw new ApiError("User account not found", 404);
        }

        if (!user.isActive) {
            throw new ApiError(
                "Your account has been disabled",
                403,
                true,
                "ACCOUNT_DISABLED"
            );
        }

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            doctorId: user.doctorId ? user.doctorId.toString() : undefined,
        };
    }

    async changePassword(
        userId: string,
        input: ChangePasswordInput,
        meta: RequestMeta = {}
    ) {
        const user = await User.findById(userId).select("+passwordHash");

        if (!user) {
            throw new ApiError("User account not found", 404);
        }

        if (!user.isActive) {
            throw new ApiError(
                "Your account has been disabled",
                403,
                true,
                "ACCOUNT_DISABLED"
            );
        }

        const isCurrentValid = await comparePassword(
            input.currentPassword,
            user.passwordHash
        );

        if (!isCurrentValid) {
            throw new ApiError(
                "Current password is incorrect",
                400,
                true,
                "INVALID_CREDENTIALS"
            );
        }

        // Hash new password and increment tokenVersion
        user.passwordHash = await hashPassword(input.newPassword);
        user.tokenVersion += 1;
        await user.save();

        // Revoke all existing sessions for this user
        await Session.updateMany(
            { userId, revokedAt: null },
            { revokedAt: new Date() }
        );

        // Issue fresh session for current device
        const familyId = crypto.randomUUID();
        const refreshToken = generateRefreshToken();
        const tokenHash = hashRefreshToken(refreshToken);

        const now = Date.now();
        const familyExpiresAt = new Date(
            now + env.SESSION_MAX_DAYS * 24 * 60 * 60 * 1000
        );
        const refreshLifetimeMs =
            env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
        const sessionExpiresAt = new Date(
            Math.min(now + refreshLifetimeMs, familyExpiresAt.getTime())
        );

        await Session.create({
            userId: user._id,
            familyId,
            tokenHash,
            expiresAt: sessionExpiresAt,
            familyExpiresAt,
            userAgent: meta.userAgent || "",
            ip: meta.ip || "",
        });

        const accessToken = generateAccessToken(user.id, user.tokenVersion);

        await auditService.record({
            action: "auth.password.change",
            entityType: "User",
            entityId: user.id,
            outcome: "success",
            actor: { id: user.id, role: user.role, email: user.email },
        });

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                doctorId: user.doctorId ? user.doctorId.toString() : undefined,
            },
            accessToken,
            refreshToken,
            refreshExpiresAt: sessionExpiresAt,
        };
    }
}

export const authService = new AuthService();
