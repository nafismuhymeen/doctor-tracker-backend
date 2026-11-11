import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface ISession extends Document {
    userId: Types.ObjectId;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    familyExpiresAt: Date;
    revokedAt?: Date | null;
    replacedByHash?: string | null;
    tokenVersion?: number;
    userAgent: string;
    ip: string;
    createdAt: Date;
    updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        familyId: {
            type: String,
            required: true,
            index: true,
        },
        tokenHash: {
            type: String,
            required: true,
            unique: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        familyExpiresAt: {
            type: Date,
            required: true,
        },
        revokedAt: {
            type: Date,
            default: null,
        },
        replacedByHash: {
            type: String,
            default: null,
        },
        tokenVersion: {
            type: Number,
            default: 0,
        },
        userAgent: {
            type: String,
            default: "",
        },
        ip: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// TTL index to automatically purge expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ familyId: 1, revokedAt: 1 });

export const Session = mongoose.model<ISession>("Session", sessionSchema);

