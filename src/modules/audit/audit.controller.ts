import type { RequestHandler } from "express";
import { auditQuerySchema, auditIdParamSchema } from "./audit.schema.js";
import { auditService } from "./audit.service.js";

class AuditController {
    getAll: RequestHandler = async (req, res) => {
        const query = auditQuerySchema.parse(req.query);
        const result = await auditService.getAll(query);

        res.status(200).json({
            success: true,
            message: "Audit logs retrieved successfully",
            data: result,
        });
    };

    getById: RequestHandler = async (req, res) => {
        const { id } = auditIdParamSchema.parse(req.params);
        const log = await auditService.getById(id);

        res.status(200).json({
            success: true,
            message: "Audit log retrieved successfully",
            data: { log },
        });
    };
}

export const auditController = new AuditController();

