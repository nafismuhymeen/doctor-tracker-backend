import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authRateLimiter } from "../../middleware/rate-limiter.js";

const router = Router();

// Public auth routes
router.post("/login", authRateLimiter, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);

// Authenticated session routes
router.post("/logout-all", authenticate, authController.logoutAll);
router.get("/me", authenticate, authController.me);
router.patch("/password", authenticate, authController.changePassword);

export { router as authRoutes };
