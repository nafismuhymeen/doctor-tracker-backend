import type { RequestHandler } from "express";

import { doctorService } from "./doctor.service.js";
import {
    createDoctorSchema,
    doctorQuerySchema,
    updateDoctorSchema,
    doctorScheduleUpdateSchema,
    deleteDoctorQuerySchema,
} from "./doctor.schema.js";
import { ApiError } from "../../utils/api-error.js";

class DoctorController {
    create: RequestHandler = async (req, res) => {
        const validatedData = createDoctorSchema.parse(req.body);

        const doctor = await doctorService.create(validatedData);

        res.status(201).json({
            success: true,
            message: "Doctor created successfully",
            data: { doctor },
        });
    };

    getAll: RequestHandler = async (req, res) => {
        const query = doctorQuerySchema.parse(req.query);

        const result = await doctorService.getAll(query);

        res.status(200).json({
            success: true,
            message: "Doctors retrieved successfully",
            data: result,
        });
    };

    getById: RequestHandler = async (req, res) => {
        const doctorId = req.params.id;

        if (!doctorId || typeof doctorId !== "string") {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const doctor = await doctorService.getById(doctorId);

        res.status(200).json({
            success: true,
            message: "Doctor retrieved successfully",
            data: { doctor },
        });
    };

    update: RequestHandler = async (req, res) => {
        const doctorId = req.params.id;

        if (!doctorId || typeof doctorId !== "string") {
            throw new ApiError("Invalid doctor ID", 400);
        }

        // Doctor role can only update their own doctor record and only schedule fields
        if (req.user?.role === "doctor") {
            if (req.user.doctorId !== doctorId) {
                throw new ApiError("Doctor not found", 404);
            }
            const validatedSchedule = doctorScheduleUpdateSchema.parse(req.body);
            const doctor = await doctorService.update(doctorId, validatedSchedule);

            res.status(200).json({
                success: true,
                message: "Doctor schedule updated successfully",
                data: { doctor },
            });
            return;
        }

        const validatedData = updateDoctorSchema.parse(req.body);

        const doctor = await doctorService.update(doctorId, validatedData);

        res.status(200).json({
            success: true,
            message: "Doctor updated successfully",
            data: { doctor },
        });
    };

    delete: RequestHandler = async (req, res) => {
        const doctorId = req.params.id;

        if (!doctorId || typeof doctorId !== "string") {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const query = deleteDoctorQuerySchema.parse(req.query);

        const result = await doctorService.delete(
            doctorId,
            query.reassignToDoctorId
        );

        res.status(200).json({
            success: true,
            message: "Doctor deleted successfully",
            data: result,
        });
    };
}

export const doctorController = new DoctorController();
