import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
    const existingId = req.headers["x-request-id"];
    const id = typeof existingId === "string" && existingId.trim() !== ""
        ? existingId
        : randomUUID();

    req.id = id;
    res.setHeader("X-Request-Id", id);

    next();
};

