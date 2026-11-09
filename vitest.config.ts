import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
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

