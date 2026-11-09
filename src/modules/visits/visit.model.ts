import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IVitals {
    bpSystolic?: number;
    bpDiastolic?: number;
    heartRate?: number;
    temperatureC?: number;
    weightKg?: number;
}

export interface IPrescription {
    drug: string;
    dose: string;
    frequency: string;
    durationDays: number;
}

export interface IAddendum {
    text: string;
    by: Types.ObjectId;
    at: Date;
}

export interface IVisit extends Document {
    patientId: Types.ObjectId;
    doctorId: Types.ObjectId;
    appointmentId?: Types.ObjectId | null;
    visitDate: Date;
    chiefComplaint: string;
    diagnosis: string;
    notes: string;
    vitals?: IVitals;
    prescriptions?: IPrescription[];
    followUpDate?: Date | null;
    createdBy: Types.ObjectId;
    addenda: IAddendum[];
    createdAt: Date;
    updatedAt: Date;
}

const vitalsSchema = new Schema<IVitals>(
    {
        bpSystolic: { type: Number, min: 50, max: 250 },
        bpDiastolic: { type: Number, min: 30, max: 150 },
        heartRate: { type: Number, min: 30, max: 250 },
        temperatureC: { type: Number, min: 30, max: 45 },
        weightKg: { type: Number, min: 1, max: 300 },
    },
    { _id: false }
);

const prescriptionSchema = new Schema<IPrescription>(
    {
        drug: { type: String, required: true, trim: true, maxlength: 100 },
        dose: { type: String, required: true, trim: true, maxlength: 50 },
        frequency: { type: String, required: true, trim: true, maxlength: 50 },
        durationDays: { type: Number, required: true, min: 1, max: 365 },
    },
    { _id: false }
);

const addendumSchema = new Schema<IAddendum>(
    {
        text: { type: String, required: true, trim: true, maxlength: 2000 },
        by: { type: Schema.Types.ObjectId, ref: "User", required: true },
        at: { type: Date, default: Date.now, required: true },
    },
    { _id: false }
);

const visitSchema = new Schema<IVisit>(
    {
        patientId: {
            type: Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
            index: true,
        },
        doctorId: {
            type: Schema.Types.ObjectId,
            ref: "Doctor",
            required: true,
            index: true,
        },
        appointmentId: {
            type: Schema.Types.ObjectId,
            ref: "Appointment",
            default: null,
        },
        visitDate: {
            type: Date,
            default: Date.now,
            required: true,
        },
        chiefComplaint: {
            type: String,
            required: true,
            trim: true,
            maxlength: 300,
        },
        diagnosis: {
            type: String,
            required: true,
            trim: true,
            maxlength: 300,
        },
        notes: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },
        vitals: {
            type: vitalsSchema,
            default: undefined,
        },
        prescriptions: {
            type: [prescriptionSchema],
            default: [],
        },
        followUpDate: {
            type: Date,
            default: null,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        addenda: {
            type: [addendumSchema],
            default: [],
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Indexes
visitSchema.index({ patientId: 1, visitDate: -1 });
visitSchema.index({ doctorId: 1, visitDate: -1 });

// Partial unique index: at most one visit per appointment
visitSchema.index(
    { appointmentId: 1 },
    {
        name: "unique_visit_per_appointment",
        unique: true,
        partialFilterExpression: { appointmentId: { $type: "objectId" } },
    }
);

export const Visit = mongoose.model<IVisit>("Visit", visitSchema);

