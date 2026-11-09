import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { appointmentController } from "./appointment.controller.js";

const router = Router();

router.use(authenticate);

router.get(
    "/",
    requireRole("admin", "staff", "doctor", "viewer"),
    appointmentController.getAll
);

router.get(
    "/:id",
    requireRole("admin", "staff", "doctor", "viewer"),
    appointmentController.getById
);

router.post(
    "/",
    requireRole("admin", "staff", "doctor"),
    appointmentController.create
);

router.patch(
    "/:id/status",
    requireRole("admin", "staff", "doctor"),
    appointmentController.updateStatus
);

router.patch(
    "/:id/reschedule",
    requireRole("admin", "staff", "doctor"),
    appointmentController.reschedule
);

export { router as appointmentRoutes };

