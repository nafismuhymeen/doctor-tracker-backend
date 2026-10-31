
import jwt from "jsonwebtoken";

import { Admin } from "../admins/admin.model.js";
import { ApiError } from "../../utils/api-error.js";
import { comparePassword } from "../../utils/password.js";

import type { LoginInput } from "./auth.schema.js";

class AuthService {
    async login(input: LoginInput) {
        const { email, password } = input;

        // Find admin and explicitly include password hash.
        const admin = await Admin.findOne({ email }).select("+passwordHash");

        if (!admin) {
            throw new ApiError("Invalid email or password", 401);
        }

        // Check whether admin account is active.
        if (!admin.isActive) {
            throw new ApiError("Your account has been disabled", 403);
        }

        // Verify password.
        const isPasswordValid = await comparePassword(
            password,
            admin.passwordHash
        );

        if (!isPasswordValid) {
            throw new ApiError("Invalid email or password", 401);
        }

        const jwtSecret = process.env.JWT_SECRET;

        if (!jwtSecret) {
            throw new ApiError(
                "Authentication configuration is missing",
                500,
                false
            );
        }

        // Generate access token.
        const accessToken = jwt.sign(
            { sub: admin.id },
            jwtSecret,
            { expiresIn: "1d" }
        );

        // Return safe admin information.
        return {
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
            },
            accessToken,
        };
    }

    async getCurrentAdmin(adminId: string) {
        const admin = await Admin.findById(adminId);

        if (!admin) {
            throw new ApiError("Admin account not found", 404);
        }

        if (!admin.isActive) {
            throw new ApiError("Your account has been disabled", 403);
        }

        return {
            id: admin.id,
            name: admin.name,
            email: admin.email,
        };
    }
}

export const authService = new AuthService();
