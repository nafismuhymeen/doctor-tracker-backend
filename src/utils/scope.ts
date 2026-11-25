import mongoose from "mongoose";
import type { Role } from "../modules/users/user.model.js";

export interface UserContext {
    id: string;
    role: Role;
    doctorId?: string;
}

export interface ScopeFilter {
    doctorId?: mongoose.Types.ObjectId;
}

/**
 * Returns a database query filter reflecting the user's role scope.
 * - 'doctor': Scoped strictly to their own doctorId.
 * - 'admin', 'staff', 'viewer': Unrestricted ({})
 */
export function scopeFor(user?: UserContext): ScopeFilter {
    if (!user) {
        return {};
    }

    if (user.role === "doctor") {
        if (user.doctorId && mongoose.Types.ObjectId.isValid(user.doctorId)) {
            return {
                doctorId: new mongoose.Types.ObjectId(user.doctorId),
            };
        }
        // Fail closed: doctor without doctorId must match nothing
        return {
            doctorId: new mongoose.Types.ObjectId("000000000000000000000000"),
        };
    }

    return {};
}

