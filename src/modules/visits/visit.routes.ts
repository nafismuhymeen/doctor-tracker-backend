import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { visitController } from "./visit.controller.js";

const router = Router();

router.use(authenticate);

// Create clinical visit (Treating doctor only)
router.post("/", requireRole("doctor"), visitController.create);

// Read clinical visit (Admin and treating doctor only)
router.get("/:id", requireRole("admin", "doctor"), visitController.getById);

// Update clinical visit within edit window (Treating doctor only)
router.patch("/:id", requireRole("doctor"), visitController.update);

// Append addendum to clinical visit (Treating doctor only)
router.post(
    "/:id/addenda",
    requireRole("doctor"),
    visitController.addAddendum
);

export { router as visitRoutes };

