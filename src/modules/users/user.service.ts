import mongoose from "mongoose";
import { ApiError } from "../../utils/api-error.js";
import { escapeRegex } from "../../utils/escape-regex.js";
import { hashPassword } from "../../utils/password.js";
import { Doctor } from "../doctors/doctor.model.js";
import { authService } from "../auth/auth.service.js";
import { User } from "./user.model.js";
import { auditService } from "../audit/audit.service.js";
import { diffObjects } from "../audit/audit.util.js";
import type {
    CreateUserInput,
    ResetUserPasswordInput,
    UpdateUserInput,
    UserQueryInput,
} from "./user.schema.js";

class UserService {
    async getAll(query: UserQueryInput) {
        const { page, limit, role, isActive, search } = query;
        const filter: Record<string, unknown> = {};

        if (role) {
            filter.role = role;
        }

        if (typeof isActive === "boolean") {
            filter.isActive = isActive;
        }

        if (search) {
            const escaped = escapeRegex(search);
            filter.$or = [
                { name: { $regex: escaped, $options: "i" } },
                { email: { $regex: escaped, $options: "i" } },
            ];
        }

        const skip = (page - 1) * limit;

        const [users, totalUsers] = await Promise.all([
            User.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("doctorId", "name specialization hospital")
                .lean(),
            User.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalUsers / limit);

        const sanitizedUsers = users.map((u) => ({
            id: u._id.toString(),
            name: u.name,
            email: u.email,
            role: u.role,
            doctorId: u.doctorId,
            isActive: u.isActive,
            tokenVersion: u.tokenVersion,
            lastLoginAt: u.lastLoginAt,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
        }));

        return {
            users: sanitizedUsers,
            pagination: {
                currentPage: page,
                limit,
                totalUsers,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    async create(input: CreateUserInput) {
        const existing = await User.findOne({ email: input.email });
        if (existing) {
            throw new ApiError(
                "A user with this email already exists",
                409,
                true,
                "EMAIL_IN_USE"
            );
        }

        let doctorObjectId: mongoose.Types.ObjectId | undefined;

        if (input.role === "doctor") {
            if (!input.doctorId || !mongoose.Types.ObjectId.isValid(input.doctorId)) {
                throw new ApiError("Invalid doctor ID", 400);
            }

            const doctor = await Doctor.findOne({
                _id: input.doctorId,
                isDeleted: false,
            });
            if (!doctor) {
                throw new ApiError("Doctor not found or inactive", 404);
            }

            const doctorInUse = await User.findOne({
                doctorId: input.doctorId,
                role: "doctor",
            });
            if (doctorInUse) {
                throw new ApiError(
                    "A user account is already assigned to this doctor",
                    409,
                    true,
                    "DOCTOR_ALREADY_ASSIGNED"
                );
            }

            doctorObjectId = new mongoose.Types.ObjectId(input.doctorId);
        }

        const passwordHash = await hashPassword(input.password);

        const user = await User.create({
            name: input.name,
            email: input.email,
            passwordHash,
            role: input.role,
            doctorId: doctorObjectId,
            isActive: true,
        });

        await auditService.record({
            action: "user.create",
            entityType: "User",
            entityId: user.id,
            outcome: "success",
            changes: [
                { field: "name", to: user.name },
                { field: "email", to: user.email },
                { field: "role", to: user.role },
                { field: "isActive", to: user.isActive },
            ],
        });

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            doctorId: user.doctorId ? user.doctorId.toString() : undefined,
            isActive: user.isActive,
            tokenVersion: user.tokenVersion,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }

    async update(id: string, input: UpdateUserInput, currentUserId: string) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError("Invalid user ID", 400);
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            throw new ApiError("User not found", 404);
        }

        const before = targetUser.toObject();

        // Cannot demote or deactivate self
        if (id === currentUserId) {
            if (input.role && input.role !== "admin") {
                throw new ApiError("You cannot change your own role", 400);
            }
            if (input.isActive === false) {
                throw new ApiError("You cannot deactivate your own account", 400);
            }
        }

        // Guard against removing or deactivating the last active admin
        const isDemotingOrDeactivatingAdmin =
            targetUser.role === "admin" &&
            targetUser.isActive &&
            ((input.role && input.role !== "admin") || input.isActive === false);

        if (isDemotingOrDeactivatingAdmin) {
            const activeAdminCount = await User.countDocuments({
                role: "admin",
                isActive: true,
            });

            if (activeAdminCount <= 1) {
                throw new ApiError(
                    "Cannot demote or deactivate the last active admin",
                    409,
                    true,
                    "LAST_ADMIN"
                );
            }
        }

        const roleChanged = input.role !== undefined && input.role !== targetUser.role;
        const deactivated = input.isActive === false && targetUser.isActive === true;

        if (input.name !== undefined) {
            targetUser.name = input.name;
        }

        if (input.role !== undefined) {
            targetUser.role = input.role;
        }

        if (input.isActive !== undefined) {
            targetUser.isActive = input.isActive;
        }

        // Handle doctorId logic
        const effectiveRole = input.role !== undefined ? input.role : targetUser.role;

        if (effectiveRole === "doctor") {
            const targetDoctorId = input.doctorId !== undefined ? input.doctorId : targetUser.doctorId?.toString();

            if (!targetDoctorId || !mongoose.Types.ObjectId.isValid(targetDoctorId)) {
                throw new ApiError("doctorId is required when role is 'doctor'", 400);
            }

            const doctor = await Doctor.findOne({
                _id: targetDoctorId,
                isDeleted: false,
            });
            if (!doctor) {
                throw new ApiError("Doctor not found or inactive", 404);
            }

            const doctorInUse = await User.findOne({
                doctorId: targetDoctorId,
                role: "doctor",
                _id: { $ne: targetUser._id },
            });
            if (doctorInUse) {
                throw new ApiError(
                    "A user account is already assigned to this doctor",
                    409,
                    true,
                    "DOCTOR_ALREADY_ASSIGNED"
                );
            }

            targetUser.doctorId = new mongoose.Types.ObjectId(targetDoctorId);
        } else {
            targetUser.doctorId = undefined;
        }

        // If role changed or deactivated, increment tokenVersion and revoke all sessions
        if (roleChanged || deactivated) {
            targetUser.tokenVersion += 1;
            await targetUser.save();
            await authService.logoutAll(targetUser.id);
        } else {
            await targetUser.save();
        }

        const after = targetUser.toObject();
        const changes = diffObjects(before, after);

        if (deactivated) {
            await auditService.record({
                action: "user.deactivate",
                entityType: "User",
                entityId: targetUser.id,
                outcome: "success",
            });
        }

        await auditService.record({
            action: "user.update",
            entityType: "User",
            entityId: targetUser.id,
            outcome: "success",
            changes,
        });

        return {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            doctorId: targetUser.doctorId ? targetUser.doctorId.toString() : undefined,
            isActive: targetUser.isActive,
            tokenVersion: targetUser.tokenVersion,
            updatedAt: targetUser.updatedAt,
        };
    }

    async resetPassword(id: string, input: ResetUserPasswordInput) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError("Invalid user ID", 400);
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            throw new ApiError("User not found", 404);
        }

        targetUser.passwordHash = await hashPassword(input.password);
        targetUser.tokenVersion += 1;
        await targetUser.save();

        await authService.logoutAll(targetUser.id);

        await auditService.record({
            action: "user.reset_password",
            entityType: "User",
            entityId: targetUser.id,
            outcome: "success",
        });

        return {
            id: targetUser.id,
            message: "User password reset successfully",
        };
    }
}

export const userService = new UserService();

