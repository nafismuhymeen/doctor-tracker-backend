import type { CorsOptions } from "cors";

const allowedOrigins = [
    process.env.CLIENT_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
].filter(Boolean) as string[];

export const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) {
            return callback(null, true);
        }

        // Allow explicitly configured origins or any vercel preview domains if needed
        const isAllowed =
            allowedOrigins.includes(origin) ||
            allowedOrigins.some((allowed) => allowed === origin.replace(/\/$/, "")) ||
            /\.vercel\.app$/.test(new URL(origin).hostname);

        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

