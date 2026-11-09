import { z } from "zod";
import { passwordSchema } from "../users/user.schema.js";

export const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .email("Please provide a valid email address")
        .toLowerCase(),
    password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
