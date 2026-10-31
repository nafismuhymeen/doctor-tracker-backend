import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";

import { ApiError } from "../utils/api-error.js";

export const errorHandler: ErrorRequestHandler = (
    error,
    _req,
    res,
    _next
) => {
    let statusCode = 500;
    let message = "Internal server error";
    let errors: unknown;

    if (error instanceof ApiError) {
        statusCode = error.statusCode;
        message = error.message;
    } else if (error instanceof ZodError) {
        statusCode = 400;
        message = "Validation failed";

        errors = error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
        }));
    } else if (error instanceof mongoose.Error.CastError) {
        statusCode = 400;
        message = "Invalid resource ID";
    } else if (error instanceof mongoose.Error.ValidationError) {
        statusCode = 400;
        message = "Database validation failed";

        errors = Object.values(error.errors).map((item) => ({
            field: item.path,
            message: item.message,
        }));
    } else if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
    ) {
        statusCode = 409;
        message = "A record with this value already exists";
    }

    if (statusCode === 500) {
        console.error(error);
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(errors ? { errors } : {}),
        ...(process.env.NODE_ENV === "development" &&
            error instanceof Error
            ? { stack: error.stack }
            : {}),
    });
};