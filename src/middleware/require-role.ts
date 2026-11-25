import type { RequestHandler } from "express";
import type { Role } from "../modules/users/user.model.js";
import { ApiError } from "../utils/api-error.js";
import { auditService } from "../modules/audit/audit.service.js";

/**
 * Middleware that restricts route access to specified roles.
 * Returns 403 Forbidden on permission failure.
 */
export const requireRole = (...roles: Role[]): RequestHandler => {
    return (req, _res, next) => {
        if (!req.user) {
            throw new ApiError("Authentication required", 401, true, "UNAUTHORIZED");
        }

        if (!roles.includes(req.user.role)) {
            void auditService.record({
                action: "access.denied",
                entityType: "Access",
                entityId: req.originalUrl || req.path,
                outcome: "failure",
                reason: `Role '${req.user.role}' not permitted. Required: [${roles.join(", ")}]`,
            });

            throw new ApiError(
                "Access forbidden: insufficient role permissions",
                403,
                true,
                "FORBIDDEN"
            );
        }

        next();
    };
};
