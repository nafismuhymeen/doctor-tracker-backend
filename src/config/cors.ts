import type { CorsOptions } from "cors";
import { env } from "./env.js";

const allowedOrigins = env.CLIENT_URLS.split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);

export const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) {
            return callback(null, true);
        }

        const normalizedOrigin = origin.replace(/\/$/, "");

        if (allowedOrigins.includes(normalizedOrigin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-Id"],
};
