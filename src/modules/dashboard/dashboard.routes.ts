import { Router } from "express";
import { dashboardController } from "./dashboard.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";

const router = Router();

// Protect all dashboard routes
router.use(authenticate);

// Dashboard statistics endpoint (Admin, Staff, Viewer only; Doctor is forbidden)
router.get(
    "/stats",
    requireRole("admin", "staff", "viewer"),
    dashboardController.getStats
);

// Appointments dashboard statistics endpoint (All authenticated roles; doctor is scoped)
router.get(
    "/appointments",
    requireRole("admin", "staff", "doctor", "viewer"),
    dashboardController.getAppointmentsStats
);

export { router as dashboardRoutes };
