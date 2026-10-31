import type { RequestHandler } from "express";
import { ApiError } from "../utils/api-error.js";

export const notFound: RequestHandler = (req, _res, next) => {
    next(
        new ApiError(
            `Route not found: ${req.method} ${req.originalUrl}`,
            404
        )
    );
};