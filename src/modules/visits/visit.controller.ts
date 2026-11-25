import type { RequestHandler } from "express";
import { ApiError } from "../../utils/api-error.js";
import {
    createAddendumSchema,
    createVisitSchema,
    updateVisitSchema,
    visitQuerySchema,
} from "./visit.schema.js";
import { visitService } from "./visit.service.js";

class VisitController {
    create: RequestHandler = async (req, res) => {
        const validated = createVisitSchema.parse(req.body);
        const visit = await visitService.create(validated, req.user!);

        res.status(201).json({
            success: true,
            message: "Clinical visit recorded successfully",
            data: { visit },
        });
    };

    getByPatientId: RequestHandler = async (req, res) => {
        const patientId = req.params.patientId;
        if (typeof patientId !== "string") {
            throw new ApiError("Invalid patient ID", 400);
        }

        const query = visitQuerySchema.parse(req.query);
        const result = await visitService.getByPatientId(
            patientId,
            query,
            req.user!
        );

        res.status(200).json({
            success: true,
            message: "Patient clinical timeline retrieved successfully",
            data: result,
        });
    };

    getById: RequestHandler = async (req, res) => {
        const id = req.params.id;
        if (typeof id !== "string") {
            throw new ApiError("Invalid visit ID", 400);
        }

        const visit = await visitService.getById(id, req.user!);

        res.status(200).json({
            success: true,
            message: "Clinical visit retrieved successfully",
            data: { visit },
        });
    };

    update: RequestHandler = async (req, res) => {
        const id = req.params.id;
        if (typeof id !== "string") {
            throw new ApiError("Invalid visit ID", 400);
        }

        const validated = updateVisitSchema.parse(req.body);
        const visit = await visitService.update(id, validated, req.user!);

        res.status(200).json({
            success: true,
            message: "Clinical visit updated successfully",
            data: { visit },
        });
    };

    addAddendum: RequestHandler = async (req, res) => {
        const id = req.params.id;
        if (typeof id !== "string") {
            throw new ApiError("Invalid visit ID", 400);
        }

        const validated = createAddendumSchema.parse(req.body);
        const visit = await visitService.addAddendum(id, validated, req.user!);

        res.status(201).json({
            success: true,
            message: "Addendum added to clinical visit successfully",
            data: { visit },
        });
    };
}

export const visitController = new VisitController();

