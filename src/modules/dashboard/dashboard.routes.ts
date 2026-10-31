import { Router } from "express";
import { dashboardController } from "./dashboard.controller.js";
import { authenticateAdmin } from "../../middleware/authenticate-admin.js";

const router = Router();

router.use(authenticateAdmin);

router.get("/stats", dashboardController.getStats);

export { router as dashboardRoutes };

