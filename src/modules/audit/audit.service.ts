import mongoose, { Types } from "mongoose";
import { AuditLog, type IAuditChange, type IAuditMetadata } from "./audit.model.js";
import { getRequestContext } from "../../utils/request-context.js";
import { logger } from "../../config/logger.js";
import { ApiError } from "../../utils/api-error.js";
import type { AuditQueryInput } from "./audit.schema.js";

export interface RecordAuditParams {
    action: string;
    entityType: string;
    entityId?: string;
    outcome?: "success" | "failure";
    changes?: IAuditChange[];
    reason?: string;
    actor?: {
        id?: string | Types.ObjectId;
        role?: string;
        email?: string;
    };
    metadata?: Partial<IAuditMetadata>;
}

class AuditService {
    /**
     * Best-effort audit recording.
     * Never throws: errors are logged via pino to prevent primary operations from failing.
     */
    async record(params: RecordAuditParams): Promise<void> {
        try {
            const ctx = getRequestContext();
            const actor = params.actor ?? ctx?.actor;
            let actorId: Types.ObjectId | undefined;

            if (actor?.id) {
                if (actor.id instanceof Types.ObjectId) {
                    actorId = actor.id;
                } else if (typeof actor.id === "string" && mongoose.isValidObjectId(actor.id)) {
                    actorId = new Types.ObjectId(actor.id);
                }
            }

            await AuditLog.create({
                actorId,
                actorRole: actor?.role,
                actorEmail: actor?.email,
                action: params.action,
                entityType: params.entityType,
                entityId: params.entityId,
                outcome: params.outcome ?? "success",
                changes: params.changes && params.changes.length > 0 ? params.changes : undefined,
                metadata: {
                    ip: params.metadata?.ip ?? ctx?.ip ?? "",
                    userAgent: params.metadata?.userAgent ?? ctx?.userAgent ?? "",
                    requestId: params.metadata?.requestId ?? ctx?.requestId ?? "",
                    reason: params.reason ?? params.metadata?.reason,
                },
            });
        } catch (error) {
            logger.error({ err: error, action: params.action }, "Failed to write audit log entry");
        }
    }

    async getAll(query: AuditQueryInput) {
        const {
            page = 1,
            limit = 20,
            actorId,
            entityType,
            entityId,
            action,
            outcome,
            from,
            to,
        } = query;

        const filter: Record<string, unknown> = {};

        if (actorId) {
            if (mongoose.isValidObjectId(actorId)) {
                filter.actorId = new Types.ObjectId(actorId);
            } else {
                filter.actorId = actorId;
            }
        }

        if (entityType) {
            filter.entityType = entityType;
        }

        if (entityId) {
            filter.entityId = entityId;
        }

        if (action) {
            filter.action = action;
        }

        if (outcome) {
            filter.outcome = outcome;
        }

        if (from || to) {
            const dateFilter: Record<string, Date> = {};
            if (from) {
                dateFilter.$gte = from;
            }
            if (to) {
                dateFilter.$lte = to;
            }
            filter.createdAt = dateFilter;
        }

        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            AuditLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            logs,
            pagination: {
                total,
                page,
                limit,
                totalPages,
            },
        };
    }

    async getById(id: string) {
        if (!mongoose.isValidObjectId(id)) {
            throw new ApiError("Audit log not found", 404);
        }

        const log = await AuditLog.findById(id).lean();
        if (!log) {
            throw new ApiError("Audit log not found", 404);
        }

        return log;
    }
}

export const auditService = new AuditService();
