import express, { type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

import { env } from "./config/env.js";
import { corsOptions } from "./config/cors.js";
import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { requestContextMiddleware } from "./utils/request-context.js";
import { httpLogger } from "./middleware/http-logger.js";
import { generalRateLimiter } from "./middleware/rate-limiter.js";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { doctorRoutes } from "./modules/doctors/doctor.routes.js";
import { patientRoutes } from "./modules/patients/patient.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { appointmentRoutes } from "./modules/appointments/appointment.routes.js";
import { visitRoutes } from "./modules/visits/visit.routes.js";
import { auditRoutes } from "./modules/audit/audit.routes.js";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/openapi.js";

const app = express();

// Trust reverse proxy (configurable via env)
app.set("trust proxy", env.TRUST_PROXY);

// Request ID tracking
app.use(requestIdMiddleware);
app.use(requestContextMiddleware);

// Structured HTTP request logging with header redaction
app.use(httpLogger);

// Security headers
app.use(helmet());

// Cross-origin resource sharing
app.use(cors(corsOptions));

// General rate limiter across all endpoints (300 req / 15 min per IP)
app.use(generalRateLimiter);

// Request parsing (payload limited to 100kb)
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());

// Health check (liveness)
app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Doctor Tracker API is running",
    });
});

// Readiness check (database connectivity & ping)
app.get("/api/v1/ready", async (_req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                success: false,
                status: "not_ready",
                message: "Database connection is not ready",
            });
        }

        if (mongoose.connection.db) {
            await mongoose.connection.db.admin().ping();
        }

        return res.status(200).json({
            success: true,
            status: "ready",
            message: "Doctor Tracker API is ready to accept traffic",
        });
    } catch {
        return res.status(503).json({
            success: false,
            status: "not_ready",
            message: "Database ping failed",
        });
    }
});

// API documentation (OpenAPI 3.1 & Swagger UI)
if (env.ENABLE_DOCS) {
    app.get("/api/openapi.json", (_req, res) => {
        res.status(200).json(openApiSpec);
    });

    const swaggerCspBypass: RequestHandler = (_req, res, next) => {
        res.removeHeader("Content-Security-Policy");
        next();
    };

    app.use(
        "/api/docs",
        swaggerCspBypass,
        swaggerUi.serve,
        swaggerUi.setup(openApiSpec)
    );
}

// API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/doctors", doctorRoutes);
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/appointments", appointmentRoutes);
app.use("/api/v1/visits", visitRoutes);
app.use("/api/v1/audit", auditRoutes);

// Handle unknown routes
app.use(notFound);

// Global error handler
app.use(errorHandler);

export { app };
