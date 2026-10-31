import { z } from "zod";

const doctorFields = {
    name: z
        .string()
        .trim()
        .min(2, "Doctor name must be at least 2 characters")
        .max(100, "Doctor name cannot exceed 100 characters"),

    specialization: z
        .string()
        .trim()
        .min(2, "Specialization is required")
        .max(100, "Specialization cannot exceed 100 characters"),

    hospital: z
        .string()
        .trim()
        .min(2, "Hospital name is required")
        .max(150, "Hospital name cannot exceed 150 characters"),

    phone: z
        .string()
        .trim()
        .min(7, "Please provide a valid phone number")
        .max(20, "Phone number cannot exceed 20 characters"),

    email: z
        .email("Please provide a valid email address")
        .trim()
        .toLowerCase(),
};

// Creating a doctor requires every field.
export const createDoctorSchema = z.object(doctorFields);

// Updating a doctor allows individual fields to be changed.
export const updateDoctorSchema = z
    .object(doctorFields)
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for an update",
    });

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;

export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;

export const doctorQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),

        limit: z.coerce.number().int().min(1).max(100).default(10),

        search: z.string().trim().max(100).optional(),

        specialization: z.string().trim().optional(),

        hospital: z.string().trim().optional(),

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

export type DoctorQueryInput = z.infer<typeof doctorQuerySchema>;