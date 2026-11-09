import mongoose, { Schema, type Document, type Types } from "mongoose";

export type Role = "admin" | "staff" | "doctor" | "viewer";

export interface IUser extends Document {
    name: string;
    email: string;
    passwordHash: string;
    role: Role;
    doctorId?: Types.ObjectId;
    isActive: boolean;
    tokenVersion: number;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const userSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        passwordHash: {
            type: String,
            required: true,
            select: false,
        },
        role: {
            type: String,
            required: true,
            enum: ["admin", "staff", "doctor", "viewer"],
            index: true,
        },
        doctorId: {
            type: Schema.Types.ObjectId,
            ref: "Doctor",
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
            required: true,
            index: true,
        },
        tokenVersion: {
            type: Number,
            default: 0,
            required: true,
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// doctorId is unique across users who have role = "doctor"
userSchema.index(
    { doctorId: 1 },
    {
        unique: true,
        partialFilterExpression: { role: "doctor" },
    }
);

export const User = mongoose.model<IUser>("User", userSchema);
