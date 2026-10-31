import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authenticateAdmin } from "../../middleware/authenticate-admin.js";

const router = Router();

router.post("/login", authController.login);

router.post("/logout", authController.logout);

router.get("/me", authenticateAdmin, authController.me);

export { router as authRoutes };