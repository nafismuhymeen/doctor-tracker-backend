import type { RequestHandler } from "express";
import { ApiError } from "../../utils/api-error.js";
import {
    appointmentQuerySchema,
    createAppointmentSchema,
    doctorAvailabilityQuerySchema,
    rescheduleAppointmentSchema,
    updateAppointmentStatusSchema,
} from "./appointment.schema.js";
import { appointmentService } from "./appointment.service.js";

class AppointmentController {
    create: RequestHandler = async (req, res) => {
        const validated = createAppointmentSchema.parse(req.body);
        const appointment = await appointmentService.create(
            validated,
            req.user!
        );

        res.status(201).json({
            success: true,
            message: "Appointment scheduled successfully",
            data: { appointment },
        });
    };

    getAll: RequestHandler = async (req, res) => {
        const query = appointmentQuerySchema.parse(req.query);
        const result = await appointmentService.getAll(query, req.user!);

        res.status(200).json({
            success: true,
            message: "Appointments retrieved successfully",
            data: result,
        });
    };

    getById: RequestHandler = async (req, res) => {
        const id = req.params.id;
        if (typeof id !== "string") {
            throw new ApiError("Invalid appointment ID", 400);
        }

        const appointment = await appointmentService.getById(id, req.user!);

        res.status(200).json({
            success: true,
            message: "Appointment retrieved successfully",
            data: { appointment },
        });
    };

    updateStatus: RequestHandler = async (req, res) => {
        const id = req.params.id;
        if (typeof id !== "string") {
            throw new ApiError("Invalid appointment ID", 400);
        }

        const validated = updateAppointmentStatusSchema.parse(req.body);
        const appointment = await appointmentService.updateStatus(
            id,
            validated,
            req.user!
        );

        res.status(200).json({
            success: true,
            message: "Appointment status updated successfully",
            data: { appointment },
        });
    };

    reschedule: RequestHandler = async (req, res) => {
        const id = req.params.id;
        if (typeof id !== "string") {
            throw new ApiError("Invalid appointment ID", 400);
        }

        const validated = rescheduleAppointmentSchema.parse(req.body);
        const appointment = await appointmentService.reschedule(
            id,
            validated,
            req.user!
        );

        res.status(200).json({
            success: true,
            message: "Appointment rescheduled successfully",
            data: { appointment },
        });
    };

    getDoctorAvailability: RequestHandler = async (req, res) => {
        const doctorId = req.params.id;
        if (typeof doctorId !== "string") {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const query = doctorAvailabilityQuerySchema.parse(req.query);
        const availability = await appointmentService.getDoctorAvailability(
            doctorId,
            query
        );

        res.status(200).json({
            success: true,
            message: "Doctor availability retrieved successfully",
            data: availability,
        });
    };
}

export const appointmentController = new AppointmentController();

