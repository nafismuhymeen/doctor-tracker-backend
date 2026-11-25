import { z } from "zod";

export const roleEnum = z.enum(["admin", "staff", "doctor", "viewer"]);

export const passwordSchema = z
    .string()
    .min(10, "Password must be at least 10 characters long")
    .max(72, "Password cannot exceed 72 characters")
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/\d/, "Password must contain at least one digit");

export const createUserSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Name must be at least 2 characters")
            .max(100, "Name cannot exceed 100 characters"),
        email: z
            .string()
            .trim()
            .email("Please provide a valid email address")
            .toLowerCase(),
        password: passwordSchema,
        role: roleEnum,
        doctorId: z.string().trim().optional(),
    })
    .refine(
        (data) => {
            if (data.role === "doctor") {
                return typeof data.doctorId === "string" && data.doctorId.length > 0;
            }
            return true;
        },
        {
            message: "doctorId is required when role is 'doctor'",
            path: ["doctorId"],
        }
    );

export const updateUserSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Name must be at least 2 characters")
            .max(100, "Name cannot exceed 100 characters")
            .optional(),
        role: roleEnum.optional(),
        isActive: z.boolean().optional(),
        doctorId: z.string().trim().nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update",
    });

export const resetUserPasswordSchema = z.object({
    password: passwordSchema,
});

export const userQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    role: roleEnum.optional(),
    isActive: z
        .preprocess((val) => {
            if (val === "true" || val === true) return true;
            if (val === "false" || val === false) return false;
            return undefined;
        }, z.boolean().optional()),
    search: z.string().trim().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
export type UserQueryInput = z.infer<typeof userQuerySchema>;

