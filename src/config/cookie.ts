import type { CookieOptions } from "express";
import { env } from "./env.js";

const isProduction = env.NODE_ENV === "production";

export const getAccessTokenCookieOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
});

export const getRefreshTokenCookieOptions = (maxAgeMs: number): CookieOptions => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/v1/auth",
    maxAge: maxAgeMs,
});

export const clearAccessTokenCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
};

export const clearRefreshTokenCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/v1/auth",
};

// Aliases for backward compatibility if referenced
export const authCookieOptions = getAccessTokenCookieOptions();
export const authCookieClearOptions = clearAccessTokenCookieOptions;
