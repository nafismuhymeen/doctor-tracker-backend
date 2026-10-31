import { z } from "zod";

const patientFields = {
    name: z
        .string()
        .trim()
        .min(2, "Patient name must be at least 2 characters")
        .max(100, "Patient name cannot exceed 100 characters"),

    age: z.coerce
        .number()
        .int("Age must be an integer")
        .min(0, "Age cannot be negative")
        .max(130, "Age cannot exceed 130"),

    gender: z.enum(["male", "female", "other"], {
        error: "Gender must be male, female, or other",
    }),

    phone: z
        .string()
        .trim()
        .min(7, "Phone number must be at least 7 characters")
        .max(20, "Phone number cannot exceed 20 characters"),

    email: z
        .string()
        .trim()
        .email("Please provide a valid email address")
        .toLowerCase()
        .optional()
        .or(z.literal("")),

    condition: z
        .string()
        .trim()
        .min(2, "Condition must be at least 2 characters")
        .max(150, "Condition cannot exceed 150 characters"),
};

export const createPatientSchema = z.object(patientFields);

export const updatePatientSchema = z
    .object(patientFields)
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update",
    });

export const patientQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(10),
        search: z.string().trim().max(100).optional(),
        condition: z.string().trim().optional(),
        doctorId: z.string().trim().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
    })
    .refine(
        (data) =>
            !data.startDate ||
            !data.endDate ||
            data.startDate <= data.endDate,
        {
            message: "Start date cannot be later than end date",
            path: ["endDate"],
        }
    );

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientQueryInput = z.infer<typeof patientQuerySchema>;
