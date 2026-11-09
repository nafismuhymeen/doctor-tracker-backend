import "dotenv/config";
import { z } from "zod";

const envSchema = z
    .object({
        NODE_ENV: z
            .enum(["development", "production", "test"])
            .default("development"),
        PORT: z.coerce.number().int().positive().default(5000),
        CLIENT_URLS: z
            .string({
                error: "CLIENT_URLS is required (comma-separated list of allowed origins)",
            })
            .min(1, "CLIENT_URLS cannot be empty"),
        MONGODB_URI: z
            .string({
                error: "MONGODB_URI is required",
            })
            .min(1, "MONGODB_URI cannot be empty"),
        JWT_SECRET: z
            .string({
                error: "JWT_SECRET is required",
            })
            .min(32, "JWT_SECRET must be at least 32 characters long"),
        COOKIE_SAME_SITE: z
            .enum(["lax", "strict", "none"])
            .default("lax"),
        TRUST_PROXY: z.coerce.number().int().nonnegative().default(1),

        // Session and Token TTL configuration (Phase 1)
        ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
        REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
        SESSION_MAX_DAYS: z.coerce.number().int().positive().default(30),
        REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().positive().default(10),

        // Booking configuration (Phase 2)
        MIN_BOOKING_LEAD_MINUTES: z.coerce.number().int().min(0).default(15),

        // Clinical Visits configuration (Phase 3)
        VISIT_EDIT_WINDOW_HOURS: z.coerce.number().int().positive().default(24),

        // Audit Log configuration (Phase 4)
        AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().optional(),

        // Platform & Delivery configuration (Phase 5)
        ENABLE_DOCS: z.coerce.boolean().default(true),
        ALLOW_SEED_RESET: z.coerce.boolean().default(false),

        // Seed Users configuration
        ADMIN_NAME: z.string().optional(),
        ADMIN_EMAIL: z.string().optional(),
        ADMIN_PASSWORD: z.string().optional(),
        STAFF_EMAIL: z.string().optional(),
        STAFF_PASSWORD: z.string().optional(),
        DOCTOR_USER_EMAIL: z.string().optional(),
        DOCTOR_USER_PASSWORD: z.string().optional(),
        VIEWER_EMAIL: z.string().optional(),
        VIEWER_PASSWORD: z.string().optional(),
    })
    .refine(
        (data) =>
            data.COOKIE_SAME_SITE !== "none" || data.NODE_ENV === "production",
        {
            message:
                'COOKIE_SAME_SITE="none" requires NODE_ENV="production" because modern browsers reject SameSite=None without the Secure attribute.',
            path: ["COOKIE_SAME_SITE"],
        }
    );

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
    console.error("FATAL: Environment validation failed at startup:");
    for (const issue of parseResult.error.issues) {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
}

export const env = parseResult.data;
export type Env = typeof env;
