import type { RequestHandler } from "express";
import { ApiError } from "../../utils/api-error.js";
import {
    createUserSchema,
    resetUserPasswordSchema,
    updateUserSchema,
    userQuerySchema,
} from "./user.schema.js";
import { userService } from "./user.service.js";

class UserController {
    getAll: RequestHandler = async (req, res) => {
        const query = userQuerySchema.parse(req.query);
        const result = await userService.getAll(query);

        res.status(200).json({
            success: true,
            message: "Users retrieved successfully",
            data: result,
        });
    };

    create: RequestHandler = async (req, res) => {
        const validated = createUserSchema.parse(req.body);
        const user = await userService.create(validated);

        res.status(201).json({
            success: true,
            message: "User created successfully",
            data: { user },
        });
    };

    update: RequestHandler = async (req, res) => {
        const userId = req.params.id;
        if (typeof userId !== "string") {
            throw new ApiError("Invalid user ID", 400);
        }

        const validated = updateUserSchema.parse(req.body);
        const currentUserId = req.user!.id;

        const user = await userService.update(userId, validated, currentUserId);

        res.status(200).json({
            success: true,
            message: "User updated successfully",
            data: { user },
        });
    };

    resetPassword: RequestHandler = async (req, res) => {
        const userId = req.params.id;
        if (typeof userId !== "string") {
            throw new ApiError("Invalid user ID", 400);
        }

        const validated = resetUserPasswordSchema.parse(req.body);
        const result = await userService.resetPassword(userId, validated);

        res.status(200).json({
            success: true,
            message: result.message,
            data: { id: result.id },
        });
    };
}

export const userController = new UserController();

