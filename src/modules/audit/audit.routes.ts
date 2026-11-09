import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { auditController } from "./audit.controller.js";

const router = Router();

// Protect all audit routes: authenticated + admin only
router.use(authenticate);
router.use(requireRole("admin"));

router.get("/", auditController.getAll);
router.get("/:id", auditController.getById);

export { router as auditRoutes };

