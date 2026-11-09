import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { userController } from "./user.controller.js";

const router = Router();

// Protect all user management routes: authenticated + admin only
router.use(authenticate);
router.use(requireRole("admin"));

router.get("/", userController.getAll);
router.post("/", userController.create);
router.patch("/:id", userController.update);
router.post("/:id/reset-password", userController.resetPassword);

export { router as userRoutes };

