import mongoose, { Schema, type Document, type Types } from "mongoose";
import { env } from "../../config/env.js";

export interface IAuditChange {
    field: string;
    from?: unknown;
    to?: unknown;
}

export interface IAuditMetadata {
    ip?: string;
    userAgent?: string;
    requestId?: string;
    reason?: string;
}

export interface IAuditLog extends Document {
    actorId?: Types.ObjectId;
    actorRole?: string;
    actorEmail?: string;
    action: string;
    entityType: string;
    entityId?: string;
    outcome: "success" | "failure";
    changes?: IAuditChange[];
    metadata?: IAuditMetadata;
    createdAt: Date;
}

const auditChangeSchema = new Schema<IAuditChange>(
    {
        field: { type: String, required: true },
        from: { type: Schema.Types.Mixed },
        to: { type: Schema.Types.Mixed },
    },
    { _id: false }
);

const auditMetadataSchema = new Schema<IAuditMetadata>(
    {
        ip: { type: String, default: "" },
        userAgent: { type: String, default: "" },
        requestId: { type: String, default: "" },
        reason: { type: String },
    },
    { _id: false }
);

const auditLogSchema = new Schema<IAuditLog>(
    {
        actorId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },
        actorRole: {
            type: String,
            default: null,
        },
        actorEmail: {
            type: String,
            default: null,
        },
        action: {
            type: String,
            required: true,
            index: true,
        },
        entityType: {
            type: String,
            required: true,
            index: true,
        },
        entityId: {
            type: String,
            default: null,
        },
        outcome: {
            type: String,
            enum: ["success", "failure"],
            default: "success",
            required: true,
        },
        changes: {
            type: [auditChangeSchema],
            default: undefined,
        },
        metadata: {
            type: auditMetadataSchema,
            default: undefined,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            required: true,
        },
    },
    {
        versionKey: false,
    }
);

// Indexes
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// Optional TTL index if AUDIT_RETENTION_DAYS is configured
if (env.AUDIT_RETENTION_DAYS) {
    auditLogSchema.index(
        { createdAt: 1 },
        { expireAfterSeconds: env.AUDIT_RETENTION_DAYS * 24 * 60 * 60 }
    );
}

// Append-only guards: forbid all mutations and deletions
const throwAppendOnlyError = function () {
    throw new Error("AuditLog is append-only and cannot be modified or deleted");
};

auditLogSchema.pre("updateOne", throwAppendOnlyError);
auditLogSchema.pre("updateMany", throwAppendOnlyError);
auditLogSchema.pre("findOneAndUpdate", throwAppendOnlyError);
auditLogSchema.pre("deleteOne", throwAppendOnlyError);
auditLogSchema.pre("deleteMany", throwAppendOnlyError);
auditLogSchema.pre("findOneAndDelete", throwAppendOnlyError);

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);

