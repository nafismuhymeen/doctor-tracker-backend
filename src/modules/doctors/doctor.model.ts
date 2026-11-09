import mongoose, { Schema } from "mongoose";

export interface IWorkingHours {
    dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    start: string; // "HH:mm"
    end: string; // "HH:mm"
}

export const DEFAULT_WORKING_HOURS: IWorkingHours[] = [
    { dayOfWeek: 0, start: "09:00", end: "17:00" },
    { dayOfWeek: 1, start: "09:00", end: "17:00" },
    { dayOfWeek: 2, start: "09:00", end: "17:00" },
    { dayOfWeek: 3, start: "09:00", end: "17:00" },
    { dayOfWeek: 4, start: "09:00", end: "17:00" },
];

export interface IDoctor {
    name: string;
    specialization: string;
    hospital: string;
    phone: string;
    email: string;
    timezone: string;
    slotMinutes: number;
    workingHours: IWorkingHours[];
    isDeleted: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const doctorSchema = new Schema<IDoctor>(
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

        timezone: {
            type: String,
            default: "Asia/Dhaka",
            required: true,
            trim: true,
        },

        slotMinutes: {
            type: Number,
            default: 30,
            required: true,
            min: 10,
            max: 120,
        },

        workingHours: {
            type: [
                {
                    _id: false,
                    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
                    start: { type: String, required: true },
                    end: { type: String, required: true },
                },
            ],
            default: DEFAULT_WORKING_HOURS,
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

// Indexes for common doctor queries
doctorSchema.index({ name: 1 });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ hospital: 1 });
doctorSchema.index({ createdAt: -1 });
doctorSchema.index({ isDeleted: 1, createdAt: -1 });

// Unique email among non-deleted doctors via partialFilterExpression
doctorSchema.index(
    { email: 1 },
    {
        unique: true,
        partialFilterExpression: { isDeleted: false },
    }
);

export const Doctor = mongoose.model<IDoctor>("Doctor", doctorSchema);
