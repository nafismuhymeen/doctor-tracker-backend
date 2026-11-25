import request from "supertest";
import { app } from "../../src/app.js";
import type { Role } from "../../src/modules/users/user.model.js";
import { createTestUser } from "./factories.js";

export async function loginAs(
    role: Role,
    overrides: Parameters<typeof createTestUser>[0] = {}
) {
    const { user, plainPassword } = await createTestUser({
        role,
        ...overrides,
    });

    const agent = request.agent(app);

    const loginRes = await agent
        .post("/api/v1/auth/login")
        .send({
            email: user.email,
            password: plainPassword,
        });

    return {
        agent,
        user,
        plainPassword,
        loginRes,
    };
}

