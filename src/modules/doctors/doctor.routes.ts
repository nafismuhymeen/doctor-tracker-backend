import { Router } from "express";
import { doctorController } from "./doctor.controller.js";
import { patientController } from "../patients/patient.controller.js";
import { authenticateAdmin } from "../../middleware/authenticate-admin.js";

const router = Router();

router.use(authenticateAdmin);

router.post("/", doctorController.create);
router.get("/", doctorController.getAll);
router.get("/:id", doctorController.getById);

router.post("/:doctorId/patients", patientController.createUnderDoctor);
router.get("/:doctorId/patients", patientController.getByDoctorId);
router.delete("/:doctorId/patients/:patientId", patientController.deleteUnderDoctor);

export { router as doctorRoutes };
