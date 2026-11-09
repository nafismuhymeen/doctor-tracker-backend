import type { RequestHandler } from "express";

import { dashboardService } from "./dashboard.service.js";
import { dashboardQuerySchema } from "./dashboard.schema.js";

class DashboardController {
    getStats: RequestHandler = async (req, res) => {
        const query = dashboardQuerySchema.parse(req.query);

        const data = await dashboardService.getDashboardStats(query);

        res.status(200).json({
            success: true,
            message: "Dashboard statistics retrieved successfully",
            data,
        });
    };

    getAppointmentsStats: RequestHandler = async (req, res) => {
        const query = dashboardQuerySchema.parse(req.query);

        const data = await dashboardService.getAppointmentDashboardStats(
            query,
            req.user!
        );

        res.status(200).json({
            success: true,
            message: "Appointments dashboard statistics retrieved successfully",
            data,
        });
    };
}

export const dashboardController = new DashboardController();

