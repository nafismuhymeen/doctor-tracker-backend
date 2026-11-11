import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { User } from "../modules/users/user.model.js";
import { ApiError } from "../utils/api-error.js";
import { env } from "../config/env.js";
import { setRequestActor } from "../utils/request-context.js";

interface AccessTokenPayload extends JwtPayload {
    sub: string;
    tv: number;
}

export const authenticate: RequestHandler = async (req, _res, next) => {
    let token = req.cookies?.accessToken;

    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        throw new ApiError("Authentication required", 401, true, "UNAUTHORIZED");
    }

    let decoded: AccessTokenPayload;

    try {
        decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    } catch {
        throw new ApiError("Invalid or expired authentication token", 401, true, "INVALID_TOKEN");
    }

    if (!decoded || !decoded.sub || typeof decoded.tv !== "number") {
        throw new ApiError("Invalid authentication token claims", 401, true, "INVALID_TOKEN");
    }

    // Always fetch user from the database; never trust token claims directly
    const user = await User.findById(decoded.sub);

    if (!user) {
        throw new ApiError("User account not found", 401, true, "UNAUTHORIZED");
    }

    if (!user.isActive) {
        throw new ApiError(
            "Your account has been disabled",
            403,
            true,
            "ACCOUNT_DISABLED"
        );
    }

    // Reject if tokenVersion does not match
    if (decoded.tv !== user.tokenVersion) {
        throw new ApiError("Authentication token has been superseded", 401, true, "INVALID_TOKEN");
    }

    req.user = {
        id: user.id,
        role: user.role,
        doctorId: user.doctorId ? user.doctorId.toString() : undefined,
    };

    setRequestActor({
        id: user.id,
        role: user.role,
        email: user.email,
    });

    next();
};
