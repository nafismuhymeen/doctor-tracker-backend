import mongoose, { Schema, type Document, type Types } from "mongoose";

export type AppointmentStatus =
    | "scheduled"
    | "completed"
    | "cancelled"
    | "no_show";

export interface IAppointment extends Document {
    doctorId: Types.ObjectId;
    patientId: Types.ObjectId;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    reason?: string;
    cancelReason?: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const appointmentSchema = new Schema<IAppointment>(
    {
        doctorId: {
            type: Schema.Types.ObjectId,
            ref: "Doctor",
            required: true,
            index: true,
        },
        patientId: {
            type: Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
            index: true,
        },
        startsAt: {
            type: Date,
            required: true,
        },
        endsAt: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ["scheduled", "completed", "cancelled", "no_show"],
            default: "scheduled",
            required: true,
            index: true,
        },
        reason: {
            type: String,
            maxlength: 300,
            trim: true,
        },
        cancelReason: {
            type: String,
            maxlength: 300,
            trim: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Compound queries
appointmentSchema.index({ patientId: 1, startsAt: 1 });
appointmentSchema.index({ status: 1, startsAt: 1 });

// Partial unique index for race-safe slot reservation
appointmentSchema.index(
    { doctorId: 1, startsAt: 1 },
    {
        name: "unique_scheduled_doctor_slot",
        unique: true,
        partialFilterExpression: { status: "scheduled" },
    }
);

export const Appointment = mongoose.model<IAppointment>(
    "Appointment",
    appointmentSchema
);
