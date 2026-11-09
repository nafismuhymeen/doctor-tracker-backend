import { Router } from "express";
import { doctorController } from "./doctor.controller.js";
import { patientController } from "../patients/patient.controller.js";
import { appointmentController } from "../appointments/appointment.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";

const router = Router();

// Protect all doctor routes
router.use(authenticate);

// Doctor availability endpoint
router.get(
    "/:id/availability",
    requireRole("admin", "staff", "doctor", "viewer"),
    appointmentController.getDoctorAvailability
);

// Doctor endpoints
router.get(
    "/",
    requireRole("admin", "staff", "doctor", "viewer"),
    doctorController.getAll
);
router.get(
    "/:id",
    requireRole("admin", "staff", "doctor", "viewer"),
    doctorController.getById
);
router.post("/", requireRole("admin"), doctorController.create);
router.patch("/:id", requireRole("admin", "doctor"), doctorController.update);
router.delete("/:id", requireRole("admin"), doctorController.delete);

// Doctor-patient endpoints
router.get(
    "/:doctorId/patients",
    requireRole("admin", "staff", "doctor", "viewer"),
    patientController.getByDoctorId
);
router.post(
    "/:doctorId/patients",
    requireRole("admin", "staff", "doctor"),
    patientController.createUnderDoctor
);
router.delete(
    "/:doctorId/patients/:patientId",
    requireRole("admin", "staff"),
    patientController.deleteUnderDoctor
);

export { router as doctorRoutes };
