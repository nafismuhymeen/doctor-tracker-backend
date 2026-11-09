import type { RequestHandler } from "express";
import { ApiError } from "../../utils/api-error.js";
import {
    createPatientSchema,
    patientQuerySchema,
    updatePatientSchema,
} from "./patient.schema.js";
import { patientService } from "./patient.service.js";

class PatientController {
    getAll: RequestHandler = async (req, res) => {
        const query = patientQuerySchema.parse(req.query);

        const result = await patientService.getAll(query, req.user);

        res.status(200).json({
            success: true,
            message: "Patients retrieved successfully",
            data: result,
        });
    };

    getById: RequestHandler = async (req, res) => {
        const patientId = req.params.id;

        if (typeof patientId !== "string") {
            throw new ApiError("Invalid patient ID", 400);
        }

        const patient = await patientService.getById(patientId, req.user);

        res.status(200).json({
            success: true,
            message: "Patient retrieved successfully",
            data: { patient },
        });
    };

    update: RequestHandler = async (req, res) => {
        const patientId = req.params.id;

        if (typeof patientId !== "string") {
            throw new ApiError("Invalid patient ID", 400);
        }

        const validatedData = updatePatientSchema.parse(req.body);
        const patient = await patientService.update(
            patientId,
            validatedData,
            req.user
        );

        res.status(200).json({
            success: true,
            message: "Patient updated successfully",
            data: { patient },
        });
    };

    delete: RequestHandler = async (req, res) => {
        const patientId = req.params.id;

        if (typeof patientId !== "string") {
            throw new ApiError("Invalid patient ID", 400);
        }

        await patientService.delete(patientId);

        res.status(200).json({
            success: true,
            message: "Patient deleted successfully",
        });
    };

    createUnderDoctor: RequestHandler = async (req, res) => {
        const doctorId = req.params.doctorId;

        if (typeof doctorId !== "string") {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const validatedData = createPatientSchema.parse(req.body);
        const patient = await patientService.createUnderDoctor(
            doctorId,
            validatedData,
            req.user
        );

        res.status(201).json({
            success: true,
            message: "Patient added under doctor successfully",
            data: { patient },
        });
    };

    getByDoctorId: RequestHandler = async (req, res) => {
        const doctorId = req.params.doctorId;

        if (typeof doctorId !== "string") {
            throw new ApiError("Invalid doctor ID", 400);
        }

        // If user is doctor and doctorId does not match their own doctorId, return 404
        if (req.user?.role === "doctor" && req.user.doctorId !== doctorId) {
            throw new ApiError("Doctor not found or inactive", 404);
        }

        const query = patientQuerySchema.parse({
            ...req.query,
            doctorId,
        });

        const result = await patientService.getAll(query, req.user);

        res.status(200).json({
            success: true,
            message: "Doctor's patients retrieved successfully",
            data: result,
        });
    };

    deleteUnderDoctor: RequestHandler = async (req, res) => {
        const { doctorId, patientId } = req.params;

        if (typeof doctorId !== "string") {
            throw new ApiError("Invalid doctor ID", 400);
        }
        if (typeof patientId !== "string") {
            throw new ApiError("Invalid patient ID", 400);
        }

        await patientService.deleteUnderDoctor(doctorId, patientId);

        res.status(200).json({
            success: true,
            message: "Patient removed from doctor successfully",
        });
    };
}

export const patientController = new PatientController();
