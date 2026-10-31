import mongoose, { Schema } from "mongoose";

const doctorSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        specialization: {
            type: String,
            required: true,
            trim: true,
        },

        hospital: {
            type: String,
            required: true,
            trim: true,
        },

        phone: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Indexes for common doctor queries
doctorSchema.index({ name: 1 });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ hospital: 1 });
doctorSchema.index({ email: 1 });
doctorSchema.index({ createdAt: -1 });

export const Doctor = mongoose.model("Doctor", doctorSchema);