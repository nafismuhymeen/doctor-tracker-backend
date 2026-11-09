import type { RequestHandler } from "express";

import {
    getAccessTokenCookieOptions,
    getRefreshTokenCookieOptions,
    clearAccessTokenCookieOptions,
    clearRefreshTokenCookieOptions,
} from "../../config/cookie.js";
import { authService } from "./auth.service.js";
import { changePasswordSchema, loginSchema } from "./auth.schema.js";
import { ApiError } from "../../utils/api-error.js";

class AuthController {
    login: RequestHandler = async (req, res) => {
        const validatedData = loginSchema.parse(req.body);

        const result = await authService.login(validatedData, {
            userAgent: req.headers["user-agent"],
            ip: req.ip,
        });

        res.cookie("accessToken", result.accessToken, getAccessTokenCookieOptions());
        res.cookie(
            "refreshToken",
            result.refreshToken,
            getRefreshTokenCookieOptions(
                result.refreshExpiresAt.getTime() - Date.now()
            )
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: result.user,
            },
        });
    };

    refresh: RequestHandler = async (req, res) => {
        const token = req.cookies?.refreshToken;

        if (!token) {
            throw new ApiError(
                "Refresh token is required",
                401,
                true,
                "SESSION_REVOKED"
            );
        }

        const result = await authService.refresh(token, {
            userAgent: req.headers["user-agent"],
            ip: req.ip,
        });

        res.cookie("accessToken", result.accessToken, getAccessTokenCookieOptions());
        res.cookie(
            "refreshToken",
            result.refreshToken,
            getRefreshTokenCookieOptions(
                result.refreshExpiresAt.getTime() - Date.now()
            )
        );

        res.status(200).json({
            success: true,
            message: "Token refreshed successfully",
            data: {
                user: result.user,
            },
        });
    };

    logout: RequestHandler = async (req, res) => {
        const token = req.cookies?.refreshToken;

        await authService.logout(token);

        res.clearCookie("accessToken", clearAccessTokenCookieOptions);
        res.clearCookie("refreshToken", clearRefreshTokenCookieOptions);

        res.status(200).json({
            success: true,
            message: "Logout successful",
        });
    };

    logoutAll: RequestHandler = async (req, res) => {
        if (!req.user) {
            throw new ApiError("Authentication required", 401);
        }

        await authService.logoutAll(req.user.id);

        res.clearCookie("accessToken", clearAccessTokenCookieOptions);
        res.clearCookie("refreshToken", clearRefreshTokenCookieOptions);

        res.status(200).json({
            success: true,
            message: "All sessions terminated successfully",
        });
    };

    me: RequestHandler = async (req, res) => {
        if (!req.user) {
            throw new ApiError("Authentication required", 401);
        }

        const user = await authService.getCurrentUser(req.user.id);

        res.status(200).json({
            success: true,
            message: "User information retrieved successfully",
            data: {
                user,
            },
        });
    };

    changePassword: RequestHandler = async (req, res) => {
        if (!req.user) {
            throw new ApiError("Authentication required", 401);
        }

        const validatedData = changePasswordSchema.parse(req.body);

        const result = await authService.changePassword(
            req.user.id,
            validatedData,
            {
                userAgent: req.headers["user-agent"],
                ip: req.ip,
            }
        );

        res.cookie("accessToken", result.accessToken, getAccessTokenCookieOptions());
        res.cookie(
            "refreshToken",
            result.refreshToken,
            getRefreshTokenCookieOptions(
                result.refreshExpiresAt.getTime() - Date.now()
            )
        );

        res.status(200).json({
            success: true,
            message: "Password changed successfully",
            data: {
                user: result.user,
            },
        });
    };
}

export const authController = new AuthController();
