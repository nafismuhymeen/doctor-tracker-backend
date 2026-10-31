import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";
import { corsOptions } from "./config/cors.js";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { doctorRoutes } from "./modules/doctors/doctor.routes.js";
import { patientRoutes } from "./modules/patients/patient.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";

const app = express();

// Security middleware
app.use(helmet());

// Cross-origin configuration for easy hosting & local development
app.use(cors(corsOptions));

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// HTTP request logging
if (process.env.NODE_ENV === "development") {
    app.use(morgan("dev"));
}

// Health check
app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Doctor Tracker API is running",
    });
});

// API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/doctors", doctorRoutes);
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);

// Handle unknown routes
app.use(notFound);

// Global error handler
app.use(errorHandler);

export { app };
