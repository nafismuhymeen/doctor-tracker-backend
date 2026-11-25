import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

export const generalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: env.GENERAL_RATE_LIMIT_MAX, // default 300 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    message: {
        success: false,
        message: "Too many requests from this IP, please try again after 15 minutes.",
    },
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: env.AUTH_RATE_LIMIT_MAX, // default 10 login attempts per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    message: {
        success: false,
        message: "Too many login attempts from this IP, please try again after 15 minutes.",
    },
});

