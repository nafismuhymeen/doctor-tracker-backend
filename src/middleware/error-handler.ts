import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import { env } from "../config/env.js";

export const errorHandler: ErrorRequestHandler = (
    error,
    _req,
    res,
    _next
) => {
    let statusCode = 500;
    let message = "Internal Server Error";
    let code: string | undefined;
    let errors: Record<string, string[]> | undefined;

    if (error instanceof ApiError) {
        statusCode = error.statusCode;
        message = error.message;
        code = error.code;
    } else if (error instanceof ZodError) {
        statusCode = 400;
        message = "Validation Error";

        errors = {};
        for (const issue of error.issues) {
            const field = issue.path.join(".");
            if (!errors[field]) {
                errors[field] = [];
            }
            errors[field].push(issue.message);
        }
    } else if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
    ) {
        statusCode = 409;
        message = "A record with this value already exists";
    } else if (
        typeof error === "object" &&
        error !== null &&
        ((error as any).status === 413 ||
            (error as any).statusCode === 413 ||
            (error as any).type === "entity.too.large")
    ) {
        statusCode = 413;
        message = "Payload too large: request body exceeds 100kb limit";
        code = "PAYLOAD_TOO_LARGE";
    }

    if (statusCode === 500) {
        console.error(error);
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(code ? { code } : {}),
        ...(errors ? { errors } : {}),
        ...(env.NODE_ENV === "development" &&
            error instanceof Error
            ? { stack: error.stack }
            : {}),
    });
};
