import { z } from "zod";
import mongoose from "mongoose";

const objectIdSchema = z
    .string()
    .trim()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid ObjectId format",
    });

export const appointmentStatusEnum = z.enum([
    "scheduled",
    "completed",
    "cancelled",
    "no_show",
]);

export const createAppointmentSchema = z.object({
    doctorId: objectIdSchema,
    patientId: objectIdSchema,
    startsAt: z.coerce.date(),
    reason: z
        .string()
        .trim()
        .max(300, "Reason cannot exceed 300 characters")
        .optional(),
});

export const appointmentQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),
    doctorId: objectIdSchema.optional(),
    patientId: objectIdSchema.optional(),
    status: appointmentStatusEnum.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});

export const updateAppointmentStatusSchema = z.object({
    status: z.enum(["completed", "cancelled", "no_show"]),
    cancelReason: z
        .string()
        .trim()
        .max(300, "Cancel reason cannot exceed 300 characters")
        .optional(),
});

export const rescheduleAppointmentSchema = z.object({
    startsAt: z.coerce.date(),
});

export const doctorAvailabilityQuerySchema = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    days: z.coerce.number().int().min(1).max(14).default(1),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type AppointmentQueryInput = z.infer<typeof appointmentQuerySchema>;
export type UpdateAppointmentStatusInput = z.infer<
    typeof updateAppointmentStatusSchema
>;
export type RescheduleAppointmentInput = z.infer<
    typeof rescheduleAppointmentSchema
>;
export type DoctorAvailabilityQueryInput = z.infer<
    typeof doctorAvailabilityQuerySchema
>;

