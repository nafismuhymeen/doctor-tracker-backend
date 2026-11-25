import { z } from "zod";
import { IANAZone } from "luxon";
import { ApiError } from "../../utils/api-error.js";

export function parseMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

export function validateWorkingHoursAlignment(
    workingHours: Array<{ start: string; end: string }>,
    slotMinutes: number
): void {
    for (const range of workingHours) {
        const startMin = parseMinutes(range.start);
        const endMin = parseMinutes(range.end);
        const duration = endMin - startMin;
        if (duration % slotMinutes !== 0) {
            throw new ApiError(
                `Working hours must align to the ${slotMinutes}-minute slot length (${range.start}-${range.end} is ${duration} minutes)`,
                400,
                true,
                "UNALIGNED_WORKING_HOURS"
            );
        }
    }
}

export const timezoneSchema = z
    .string()
    .trim()
    .refine((tz) => IANAZone.isValidZone(tz), {
        message: "Must be a valid IANA timezone identifier (e.g. Asia/Dhaka)",
    });

export const slotMinutesSchema = z
    .number()
    .int()
    .min(10, "slotMinutes must be at least 10")
    .max(120, "slotMinutes cannot exceed 120")
    .refine((val) => val % 5 === 0, {
        message: "slotMinutes must be a multiple of 5",
    });

export const workingHourItemSchema = z
    .object({
        dayOfWeek: z.number().int().min(0).max(6),
        start: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm format"),
        end: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm format"),
    })
    .refine((data) => parseMinutes(data.start) < parseMinutes(data.end), {
        message: "Start time must be before end time",
        path: ["start"],
    });

export function hasNoOverlappingRanges(
    items: Array<{ dayOfWeek: number; start: string; end: string }>
): boolean {
    const byDay = new Map<number, Array<[number, number]>>();
    for (const item of items) {
        const ranges = byDay.get(item.dayOfWeek) || [];
        const s = parseMinutes(item.start);
        const e = parseMinutes(item.end);
        for (const [os, oe] of ranges) {
            if (s < oe && e > os) return false;
        }
        ranges.push([s, e]);
        byDay.set(item.dayOfWeek, ranges);
    }
    return true;
}

export const workingHoursSchema = z
    .array(workingHourItemSchema)
    .max(28, "Cannot exceed 28 working hour ranges")
    .refine((items) => hasNoOverlappingRanges(items), {
        message: "Working hour ranges must not overlap on the same day",
    });

const doctorFields = {
    name: z
        .string()
        .trim()
        .min(2, "Doctor name must be at least 2 characters")
        .max(100, "Doctor name cannot exceed 100 characters"),

    specialization: z
        .string()
        .trim()
        .min(2, "Specialization is required")
        .max(100, "Specialization cannot exceed 100 characters"),

    hospital: z
        .string()
        .trim()
        .min(2, "Hospital name is required")
        .max(150, "Hospital name cannot exceed 150 characters"),

    phone: z
        .string()
        .trim()
        .min(7, "Please provide a valid phone number")
        .max(20, "Phone number cannot exceed 20 characters"),

    email: z
        .string()
        .email("Please provide a valid email address")
        .trim()
        .toLowerCase(),

    timezone: timezoneSchema.optional().default("Asia/Dhaka"),
    slotMinutes: slotMinutesSchema.optional().default(30),
    workingHours: workingHoursSchema.optional(),
};

// Creating a doctor
export const createDoctorSchema = z.object(doctorFields);

// Updating a doctor allows individual fields to be changed.
export const updateDoctorSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Doctor name must be at least 2 characters")
            .max(100, "Doctor name cannot exceed 100 characters")
            .optional(),
        specialization: z
            .string()
            .trim()
            .min(2, "Specialization is required")
            .max(100, "Specialization cannot exceed 100 characters")
            .optional(),
        hospital: z
            .string()
            .trim()
            .min(2, "Hospital name is required")
            .max(150, "Hospital name cannot exceed 150 characters")
            .optional(),
        phone: z
            .string()
            .trim()
            .min(7, "Please provide a valid phone number")
            .max(20, "Phone number cannot exceed 20 characters")
            .optional(),
        email: z
            .string()
            .email("Please provide a valid email address")
            .trim()
            .toLowerCase()
            .optional(),
        timezone: timezoneSchema.optional(),
        slotMinutes: slotMinutesSchema.optional(),
        workingHours: workingHoursSchema.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for an update",
    });

// Doctor self-update schema (schedule fields only)
export const doctorScheduleUpdateSchema = z
    .object({
        timezone: timezoneSchema.optional(),
        slotMinutes: slotMinutesSchema.optional(),
        workingHours: workingHoursSchema.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one schedule field must be provided for an update",
    });

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type DoctorScheduleUpdateInput = z.infer<typeof doctorScheduleUpdateSchema>;

export const doctorQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),

        limit: z.coerce.number().int().min(1).max(100).default(10),

        search: z.string().trim().max(100).optional(),

        specialization: z.string().trim().optional(),

        hospital: z.string().trim().optional(),

        startDate: z.coerce.date().optional(),

        endDate: z.coerce.date().optional(),
    })
    .refine(
        (data) =>
            !data.startDate ||
            !data.endDate ||
            data.startDate <= data.endDate,
        {
            message: "Start date cannot be later than end date",
            path: ["endDate"],
        }
    );

export type DoctorQueryInput = z.infer<typeof doctorQuerySchema>;

export const deleteDoctorQuerySchema = z.object({
    reassignToDoctorId: z.string().trim().optional(),
});

export type DeleteDoctorQueryInput = z.infer<typeof deleteDoctorQuerySchema>;
