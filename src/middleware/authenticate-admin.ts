import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { Admin } from "../modules/admins/admin.model.js";
import { ApiError } from "../utils/api-error.js";

export const authenticateAdmin: RequestHandler = async (
    req,
    _res,
    next
) => {
    let token = req.cookies?.accessToken;

    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        throw new ApiError("Authentication required", 401);
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        throw new ApiError("Authentication configuration is missing", 500, false);
    }

    let decoded: string | JwtPayload;

    try {
        decoded = jwt.verify(token, jwtSecret);
    } catch {
        throw new ApiError("Invalid or expired authentication token", 401);
    }

    if (typeof decoded === "string" || !decoded.sub) {
        throw new ApiError("Invalid authentication token", 401);
    }

    const admin = await Admin.findById(decoded.sub);

    if (!admin) {
        throw new ApiError("Admin account not found", 401);
    }

    if (!admin.isActive) {
        throw new ApiError("Your account has been disabled", 403);
    }

    req.adminId = admin.id;

    next();
};