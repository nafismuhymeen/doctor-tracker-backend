import type { CookieOptions } from "express";

export const authCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
};

export const authCookieClearOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/",
};