import { describe, it, expect } from "vitest";
import { envSchema, env } from "../src/config/env.js";
import { authRateLimiter, generalRateLimiter } from "../src/middleware/rate-limiter.js";

describe("Rate Limiter Configuration & Middleware", () => {
    describe("Environment variable defaults and overrides", () => {
        it("defaults AUTH_RATE_LIMIT_MAX to 10 and GENERAL_RATE_LIMIT_MAX to 300", () => {
            expect(envSchema.shape.AUTH_RATE_LIMIT_MAX.parse(undefined)).toBe(10);
            expect(envSchema.shape.GENERAL_RATE_LIMIT_MAX.parse(undefined)).toBe(300);
            expect(env.AUTH_RATE_LIMIT_MAX).toBe(10);
            expect(env.GENERAL_RATE_LIMIT_MAX).toBe(300);
        });

        it("respects overrides when positive integer strings or numbers are provided", () => {
            expect(envSchema.shape.AUTH_RATE_LIMIT_MAX.parse("25")).toBe(25);
            expect(envSchema.shape.AUTH_RATE_LIMIT_MAX.parse(50)).toBe(50);

            expect(envSchema.shape.GENERAL_RATE_LIMIT_MAX.parse("500")).toBe(500);
            expect(envSchema.shape.GENERAL_RATE_LIMIT_MAX.parse(1000)).toBe(1000);
        });

        it("rejects non-positive numbers or zero", () => {
            expect(() => envSchema.shape.AUTH_RATE_LIMIT_MAX.parse(0)).toThrow();
            expect(() => envSchema.shape.AUTH_RATE_LIMIT_MAX.parse("-10")).toThrow();
            expect(() => envSchema.shape.GENERAL_RATE_LIMIT_MAX.parse(0)).toThrow();
            expect(() => envSchema.shape.GENERAL_RATE_LIMIT_MAX.parse("-300")).toThrow();
        });
    });

    describe("Middleware instances", () => {
        it("exports valid middleware functions for authRateLimiter and generalRateLimiter", () => {
            expect(typeof authRateLimiter).toBe("function");
            expect(typeof generalRateLimiter).toBe("function");
        });
    });
});
