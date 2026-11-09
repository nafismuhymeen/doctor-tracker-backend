import { pinoHttp } from "pino-http";
import { logger } from "../config/logger.js";
import { randomUUID } from "node:crypto";

export const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => {
        return (
            (req as any).id ||
            (req.headers["x-request-id"] as string) ||
            randomUUID()
        );
    },
    redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        'res.headers["set-cookie"]',
    ],
    customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
    },
});

