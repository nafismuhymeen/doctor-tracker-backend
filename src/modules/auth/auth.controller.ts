import type { RequestHandler } from "express";

import { authCookieOptions, authCookieClearOptions } from "../../config/cookie.js";
import { authService } from "./auth.service.js";
import { loginSchema } from "./auth.schema.js";
import { ApiError } from "../../utils/api-error.js";

class AuthController {
    login: RequestHandler = async (req, res) => {
        const validatedData = loginSchema.parse(req.body);

        const { admin, accessToken } = await authService.login(validatedData);

        res.cookie("accessToken", accessToken, authCookieOptions);

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                admin,
            },
        });
    };

    logout: RequestHandler = (_req, res) => {
        res.clearCookie("accessToken", authCookieClearOptions);

        res.status(200).json({
            success: true,
            message: "Logout successful",
        });
    };

    me: RequestHandler = async (req, res) => {
        if (!req.adminId) {
            throw new ApiError("Authentication required", 401);
        }

        const admin = await authService.getCurrentAdmin(req.adminId);

        res.status(200).json({
            success: true,
            message: "Admin information retrieved successfully",
            data: {
                admin,
            },
        });
    };
}

export const authController = new AuthController();