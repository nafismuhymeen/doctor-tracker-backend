import { Router } from "express";
import { patientController } from "./patient.controller.js";
import { visitController } from "../visits/visit.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";

const router = Router();

// Protect all patient routes
router.use(authenticate);

// Dedicated Patient Page routes
router.get(
    "/",
    requireRole("admin", "staff", "doctor", "viewer"),
    patientController.getAll
);
router.get(
    "/:patientId/visits",
    requireRole("admin", "doctor"),
    visitController.getByPatientId
);
router.get(
    "/:id",
    requireRole("admin", "staff", "doctor", "viewer"),
    patientController.getById
);
router.patch(
    "/:id",
    requireRole("admin", "staff", "doctor"),
    patientController.update
);
router.delete(
    "/:id",
    requireRole("admin", "staff"),
    patientController.delete
);

export { router as patientRoutes };
