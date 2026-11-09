import { z } from "zod";
import mongoose from "mongoose";

const objectIdSchema = z
    .string()
    .trim()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid ObjectId format",
    });

export const vitalsSchema = z.object({
    bpSystolic: z
        .number()
        .min(50, "Systolic BP must be at least 50")
        .max(250, "Systolic BP cannot exceed 250")
        .optional(),
    bpDiastolic: z
        .number()
        .min(30, "Diastolic BP must be at least 30")
        .max(150, "Diastolic BP cannot exceed 150")
        .optional(),
    heartRate: z
        .number()
        .min(30, "Heart rate must be at least 30")
        .max(250, "Heart rate cannot exceed 250")
        .optional(),
    temperatureC: z
        .number()
        .min(30, "Temperature must be at least 30°C")
        .max(45, "Temperature cannot exceed 45°C")
        .optional(),
    weightKg: z
        .number()
        .min(1, "Weight must be at least 1kg")
        .max(300, "Weight cannot exceed 300kg")
        .optional(),
});

export const prescriptionItemSchema = z.object({
    drug: z
        .string()
        .trim()
        .min(1, "Drug name is required")
        .max(100, "Drug name cannot exceed 100 characters"),
    dose: z
        .string()
        .trim()
        .min(1, "Dose is required")
        .max(50, "Dose cannot exceed 50 characters"),
    frequency: z
        .string()
        .trim()
        .min(1, "Frequency is required")
        .max(50, "Frequency cannot exceed 50 characters"),
    durationDays: z
        .number()
        .int()
        .min(1, "Duration must be at least 1 day")
        .max(365, "Duration cannot exceed 365 days"),
});

export const createVisitSchema = z.object({
    patientId: objectIdSchema,
    appointmentId: objectIdSchema.optional(),
    visitDate: z.coerce.date().optional(),
    chiefComplaint: z
        .string()
        .trim()
        .min(1, "Chief complaint is required")
        .max(300, "Chief complaint cannot exceed 300 characters"),
    diagnosis: z
        .string()
        .trim()
        .min(1, "Diagnosis is required")
        .max(300, "Diagnosis cannot exceed 300 characters"),
    notes: z
        .string()
        .trim()
        .min(1, "Notes are required")
        .max(5000, "Notes cannot exceed 5000 characters"),
    vitals: vitalsSchema.optional(),
    prescriptions: z
        .array(prescriptionItemSchema)
        .max(20, "Cannot prescribe more than 20 medications per visit")
        .optional(),
    followUpDate: z.coerce.date().optional(),
});

export const updateVisitSchema = z
    .object({
        chiefComplaint: z
            .string()
            .trim()
            .min(1, "Chief complaint is required")
            .max(300, "Chief complaint cannot exceed 300 characters")
            .optional(),
        diagnosis: z
            .string()
            .trim()
            .min(1, "Diagnosis is required")
            .max(300, "Diagnosis cannot exceed 300 characters")
            .optional(),
        notes: z
            .string()
            .trim()
            .min(1, "Notes are required")
            .max(5000, "Notes cannot exceed 5000 characters")
            .optional(),
        vitals: vitalsSchema.optional(),
        prescriptions: z
            .array(prescriptionItemSchema)
            .max(20, "Cannot prescribe more than 20 medications per visit")
            .optional(),
        followUpDate: z.coerce.date().nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update",
    });

export const createAddendumSchema = z.object({
    text: z
        .string()
        .trim()
        .min(1, "Addendum text is required")
        .max(2000, "Addendum cannot exceed 2000 characters"),
});

export const visitQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;
export type CreateAddendumInput = z.infer<typeof createAddendumSchema>;
export type VisitQueryInput = z.infer<typeof visitQuerySchema>;

