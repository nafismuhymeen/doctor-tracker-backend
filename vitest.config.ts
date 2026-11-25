import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        env: {
            NODE_ENV: "test",
            CLIENT_URLS: "http://localhost:3000",
            MONGODB_URI: "mongodb://localhost:27017/doctor_tracker_test",
            JWT_SECRET: "super_secret_jwt_key_here_at_least_32_chars_long_for_testing",
        },
        setupFiles: ["./tests/setup.ts"],
        pool: "forks",
        testTimeout: 30000,
        hookTimeout: 30000,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/modules/**/*.service.ts"],
            thresholds: {
                lines: 70,
            },
        },
    },
});

