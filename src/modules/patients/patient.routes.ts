import { Router } from "express";
import { patientController } from "./patient.controller.js";
import { authenticateAdmin } from "../../middleware/authenticate-admin.js";

const router = Router();

router.use(authenticateAdmin);

router.get("/", patientController.getAll);
router.get("/:id", patientController.getById);
router.patch("/:id", patientController.update);
router.delete("/:id", patientController.delete);

export { router as patientRoutes };
