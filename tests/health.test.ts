import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Health Check", () => {
    it("returns 200 and healthy status", async () => {
        const res = await request(app).get("/api/v1/health");

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe("Doctor Tracker API is running");
    });
});

