import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IPatient extends Document {
    name: string;
    age: number;
    gender: "male" | "female" | "other";
    phone: string;
    email?: string;
    condition: string;
    doctorId: Types.ObjectId;
    isDeleted: boolean;
    deletedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const patientSchema = new Schema<IPatient>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        age: {
            type: Number,
            required: true,
            min: 0,
            max: 130,
        },
        gender: {
            type: String,
            required: true,
            enum: ["male", "female", "other"],
            trim: true,
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        condition: {
            type: String,
            required: true,
            trim: true,
        },
        doctorId: {
            type: Schema.Types.ObjectId,
            ref: "Doctor",
            required: true,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            required: true,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

patientSchema.index({ doctorId: 1 });
patientSchema.index({ condition: 1 });
patientSchema.index({ name: 1 });
patientSchema.index({ phone: 1 });
patientSchema.index({ createdAt: -1 });
patientSchema.index({ doctorId: 1, createdAt: -1 });

export const Patient = mongoose.model<IPatient>("Patient", patientSchema);
