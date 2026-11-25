import mongoose from "mongoose";
import { DateTime } from "luxon";
import { Appointment } from "./appointment.model.js";
import { Doctor } from "../doctors/doctor.model.js";
import { Patient } from "../patients/patient.model.js";
import { Visit } from "../visits/visit.model.js";
import { auditService } from "../audit/audit.service.js";
import { ApiError } from "../../utils/api-error.js";
import { env } from "../../config/env.js";
import type { UserContext } from "../../utils/scope.js";
import type {
    AppointmentQueryInput,
    CreateAppointmentInput,
    DoctorAvailabilityQueryInput,
    RescheduleAppointmentInput,
    UpdateAppointmentStatusInput,
} from "./appointment.schema.js";

function parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

class AppointmentService {
    /**
     * Checks if a given startsAt corresponds to a valid slot in doctor's working hours.
     */
    isValidDoctorSlot(
        startsAt: Date,
        doctor: { timezone: string; slotMinutes: number; workingHours: Array<{ dayOfWeek: number; start: string; end: string }> }
    ): boolean {
        const dt = DateTime.fromJSDate(startsAt, { zone: doctor.timezone });
        if (!dt.isValid) return false;

        const dayOfWeek = dt.weekday % 7; // 0 = Sunday, 1 = Monday, etc.
        const slotMinutes = doctor.slotMinutes;
        const startMinutes = dt.hour * 60 + dt.minute;
        const endMinutes = startMinutes + slotMinutes;

        // Seconds and milliseconds must be 0
        if (dt.second !== 0 || dt.millisecond !== 0) return false;

        // Check if falls completely inside any working hour range for this day
        return doctor.workingHours.some((range) => {
            if (range.dayOfWeek !== dayOfWeek) return false;
            const rStart = parseTimeToMinutes(range.start);
            const rEnd = parseTimeToMinutes(range.end);

            if (startMinutes < rStart || endMinutes > rEnd) return false;
            return (startMinutes - rStart) % slotMinutes === 0;
        });
    }

    /**
     * Generate slot availability for a doctor over 1..14 days.
     */
    async getDoctorAvailability(
        doctorId: string,
        query: DoctorAvailabilityQueryInput
    ) {
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const doctor = await Doctor.findOne({ _id: doctorId, isDeleted: false });
        if (!doctor) {
            throw new ApiError("Doctor not found or inactive", 404);
        }

        const { date, days } = query;
        const startDt = DateTime.fromISO(date, { zone: doctor.timezone }).startOf("day");
        if (!startDt.isValid) {
            throw new ApiError("Invalid date provided", 400);
        }

        const endDt = startDt.plus({ days });
        const now = DateTime.utc();
        const minBookingTime = now.plus({ minutes: env.MIN_BOOKING_LEAD_MINUTES });

        // Fetch all scheduled appointments in this range
        const scheduledAppointments = await Appointment.find({
            doctorId: doctor._id,
            status: "scheduled",
            startsAt: { $gte: startDt.toJSDate(), $lt: endDt.toJSDate() },
        }).select("startsAt endsAt");

        const bookedStarts = new Set(
            scheduledAppointments.map((a) => a.startsAt.getTime())
        );

        const resultDays = [];

        for (let i = 0; i < days; i++) {
            const currentDay = startDt.plus({ days: i });
            const dayOfWeek = currentDay.weekday % 7;
            const dateStr = currentDay.toFormat("yyyy-MM-dd");

            const dayWorkingHours = doctor.workingHours.filter(
                (w) => w.dayOfWeek === dayOfWeek
            );

            const daySlots: Array<{
                startsAt: string;
                endsAt: string;
                available: boolean;
            }> = [];

            for (const range of dayWorkingHours) {
                const [sH, sM] = range.start.split(":").map(Number);
                const [eH, eM] = range.end.split(":").map(Number);

                let slotStart = currentDay.set({
                    hour: sH,
                    minute: sM,
                    second: 0,
                    millisecond: 0,
                });
                const rangeEnd = currentDay.set({
                    hour: eH,
                    minute: eM,
                    second: 0,
                    millisecond: 0,
                });

                while (
                    slotStart.plus({ minutes: doctor.slotMinutes }) <= rangeEnd
                ) {
                    const slotEnd = slotStart.plus({
                        minutes: doctor.slotMinutes,
                    });
                    const slotStartMillis = slotStart.toMillis();

                    const isBooked = bookedStarts.has(slotStartMillis);
                    const isTooSoon = slotStart.toUTC() < minBookingTime;

                    daySlots.push({
                        startsAt: slotStart.toUTC().toISO()!,
                        endsAt: slotEnd.toUTC().toISO()!,
                        available: !isBooked && !isTooSoon,
                    });

                    slotStart = slotEnd;
                }
            }

            resultDays.push({
                date: dateStr,
                slots: daySlots,
            });
        }

        return {
            doctorId: doctor.id,
            timezone: doctor.timezone,
            slotMinutes: doctor.slotMinutes,
            days: resultDays,
        };
    }

    /**
     * Create an appointment with full validation and race protection.
     */
    async create(input: CreateAppointmentInput, user: UserContext) {
        const { doctorId, patientId, startsAt, reason } = input;

        // Scoping check for doctor role
        if (user.role === "doctor" && user.doctorId !== doctorId) {
            throw new ApiError("Doctor not found or inactive", 404);
        }

        const [doctor, patient] = await Promise.all([
            Doctor.findOne({ _id: doctorId, isDeleted: false }),
            Patient.findOne({ _id: patientId, isDeleted: false }),
        ]);

        if (!doctor) {
            throw new ApiError("Doctor not found or inactive", 404);
        }

        if (!patient) {
            throw new ApiError("Patient not found or inactive", 404);
        }

        // Validate patient is assigned to this doctor
        if (patient.doctorId.toString() !== doctorId) {
            throw new ApiError("Patient is not assigned to this doctor", 400);
        }

        // Validate working hours & slot alignment
        if (!this.isValidDoctorSlot(startsAt, doctor)) {
            throw new ApiError(
                "Requested time is outside doctor's working hours or misaligned with slot duration",
                400,
                true,
                "OUTSIDE_WORKING_HOURS"
            );
        }

        // Calculate endsAt
        const endsAt = new Date(
            startsAt.getTime() + doctor.slotMinutes * 60 * 1000
        );

        // Lead time & advance booking check
        const now = new Date();
        const minBookingTime = new Date(
            now.getTime() + env.MIN_BOOKING_LEAD_MINUTES * 60 * 1000
        );
        if (startsAt < minBookingTime) {
            throw new ApiError(
                `Appointments must be booked at least ${env.MIN_BOOKING_LEAD_MINUTES} minutes in advance`,
                400
            );
        }

        const maxBookingTime = new Date(
            now.getTime() + 180 * 24 * 60 * 60 * 1000
        );
        if (startsAt > maxBookingTime) {
            throw new ApiError(
                "Appointments cannot be booked more than 180 days in advance",
                400
            );
        }

        // Check if patient already has an overlapping scheduled appointment
        const patientOverlap = await Appointment.findOne({
            patientId,
            status: "scheduled",
            startsAt: { $lt: endsAt },
            endsAt: { $gt: startsAt },
        });

        if (patientOverlap) {
            throw new ApiError(
                "Patient already has an overlapping appointment scheduled",
                409,
                true,
                "PATIENT_DOUBLE_BOOKED"
            );
        }

        // Insert with partial unique index race protection
        try {
            const appointment = await Appointment.create({
                doctorId,
                patientId,
                startsAt,
                endsAt,
                status: "scheduled",
                reason,
                createdBy: user.id,
            });

            await auditService.record({
                action: "appointment.create",
                entityType: "Appointment",
                entityId: appointment.id,
                outcome: "success",
                changes: [
                    { field: "doctorId", to: appointment.doctorId },
                    { field: "patientId", to: appointment.patientId },
                    { field: "startsAt", to: appointment.startsAt },
                    { field: "endsAt", to: appointment.endsAt },
                    { field: "status", to: appointment.status },
                ],
            });

            return appointment;
        } catch (error: any) {
            if (error.code === 11000) {
                throw new ApiError(
                    "This appointment slot is already taken",
                    409,
                    true,
                    "SLOT_TAKEN"
                );
            }
            throw error;
        }
    }

    /**
     * Get paginated appointments.
     */
    async getAll(query: AppointmentQueryInput, user: UserContext) {
        const { page, limit, doctorId, patientId, status, from, to } = query;
        const filter: Record<string, unknown> = {};

        if (user.role === "doctor") {
            if (!user.doctorId) {
                filter.doctorId = new mongoose.Types.ObjectId();
            } else {
                if (doctorId && doctorId !== user.doctorId) {
                    throw new ApiError("Doctor not found or inactive", 404);
                }
                filter.doctorId = new mongoose.Types.ObjectId(user.doctorId);
            }
        } else if (doctorId) {
            filter.doctorId = new mongoose.Types.ObjectId(doctorId);
        }

        if (patientId) {
            filter.patientId = new mongoose.Types.ObjectId(patientId);
        }

        if (status) {
            filter.status = status;
        }

        if (from || to) {
            const startsAt: Record<string, Date> = {};
            if (from) startsAt.$gte = from;
            if (to) startsAt.$lte = to;
            filter.startsAt = startsAt;
        }

        const skip = (page - 1) * limit;

        const [appointments, totalAppointments] = await Promise.all([
            Appointment.find(filter)
                .sort({ startsAt: 1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: "doctorId",
                    match: { isDeleted: false },
                    select: "name specialization hospital",
                })
                .populate({
                    path: "patientId",
                    match: { isDeleted: false },
                    select: "name phone email",
                })
                .lean(),
            Appointment.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalAppointments / limit);

        return {
            appointments,
            pagination: {
                currentPage: page,
                limit,
                totalAppointments,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    /**
     * Get single appointment by ID with scoping.
     */
    async getById(id: string, user: UserContext) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError("Invalid appointment ID", 400);
        }

        const filter: Record<string, unknown> = { _id: id };
        if (user.role === "doctor") {
            if (!user.doctorId) {
                throw new ApiError("Appointment not found", 404);
            }
            filter.doctorId = new mongoose.Types.ObjectId(user.doctorId);
        }

        const appointment = await Appointment.findOne(filter)
            .populate({
                path: "doctorId",
                match: { isDeleted: false },
                select: "name specialization hospital email phone",
            })
            .populate({
                path: "patientId",
                match: { isDeleted: false },
                select: "name phone email condition",
            })
            .lean();

        if (!appointment) {
            throw new ApiError("Appointment not found", 404);
        }

        let visitId: string | undefined;
        if (user.role === "admin" || user.role === "doctor") {
            const visit = await Visit.findOne({
                appointmentId: appointment._id,
            })
                .select("_id")
                .lean();
            if (visit) {
                visitId = visit._id.toString();
            }
        }

        return {
            ...appointment,
            ...(visitId ? { visitId } : {}),
        };
    }

    /**
     * Transition appointment status.
     */
    async updateStatus(
        id: string,
        input: UpdateAppointmentStatusInput,
        user: UserContext
    ) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError("Invalid appointment ID", 400);
        }

        const filter: Record<string, unknown> = { _id: id };
        if (user.role === "doctor") {
            if (!user.doctorId) {
                throw new ApiError("Appointment not found", 404);
            }
            filter.doctorId = new mongoose.Types.ObjectId(user.doctorId);
        }

        const appointment = await Appointment.findOne(filter);
        if (!appointment) {
            throw new ApiError("Appointment not found", 404);
        }

        if (appointment.status !== "scheduled") {
            throw new ApiError(
                `Cannot transition appointment from '${appointment.status}' to '${input.status}'`,
                409,
                true,
                "INVALID_STATUS_TRANSITION"
            );
        }

        const now = new Date();
        if (
            (input.status === "completed" || input.status === "no_show") &&
            appointment.startsAt > now
        ) {
            throw new ApiError(
                `Cannot mark appointment as '${input.status}' before its scheduled start time`,
                400
            );
        }

        const previousStatus = appointment.status;
        appointment.status = input.status;
        if (input.cancelReason) {
            appointment.cancelReason = input.cancelReason;
        }

        await appointment.save();

        await auditService.record({
            action: "appointment.status_change",
            entityType: "Appointment",
            entityId: appointment.id,
            outcome: "success",
            changes: [
                { field: "status", from: previousStatus, to: appointment.status },
            ],
            reason: input.cancelReason,
        });

        return appointment;
    }

    /**
     * Reschedule appointment slot with validation and race protection.
     */
    async reschedule(
        id: string,
        input: RescheduleAppointmentInput,
        user: UserContext
    ) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError("Invalid appointment ID", 400);
        }

        const filter: Record<string, unknown> = { _id: id };
        if (user.role === "doctor") {
            if (!user.doctorId) {
                throw new ApiError("Appointment not found", 404);
            }
            filter.doctorId = new mongoose.Types.ObjectId(user.doctorId);
        }

        const appointment = await Appointment.findOne(filter);
        if (!appointment) {
            throw new ApiError("Appointment not found", 404);
        }

        if (appointment.status !== "scheduled") {
            throw new ApiError(
                `Cannot reschedule appointment with status '${appointment.status}'`,
                409,
                true,
                "INVALID_STATUS_TRANSITION"
            );
        }

        const doctor = await Doctor.findOne({
            _id: appointment.doctorId,
            isDeleted: false,
        });
        if (!doctor) {
            throw new ApiError("Doctor not found or inactive", 404);
        }

        const newStartsAt = input.startsAt;

        // Slot validation
        if (!this.isValidDoctorSlot(newStartsAt, doctor)) {
            throw new ApiError(
                "Requested time is outside doctor's working hours or misaligned with slot duration",
                400,
                true,
                "OUTSIDE_WORKING_HOURS"
            );
        }

        const newEndsAt = new Date(
            newStartsAt.getTime() + doctor.slotMinutes * 60 * 1000
        );

        // Lead time & horizon
        const now = new Date();
        const minBookingTime = new Date(
            now.getTime() + env.MIN_BOOKING_LEAD_MINUTES * 60 * 1000
        );
        if (newStartsAt < minBookingTime) {
            throw new ApiError(
                `Appointments must be booked at least ${env.MIN_BOOKING_LEAD_MINUTES} minutes in advance`,
                400
            );
        }

        const maxBookingTime = new Date(
            now.getTime() + 180 * 24 * 60 * 60 * 1000
        );
        if (newStartsAt > maxBookingTime) {
            throw new ApiError(
                "Appointments cannot be booked more than 180 days in advance",
                400
            );
        }

        // Patient double booking check (excluding this appointment)
        const patientOverlap = await Appointment.findOne({
            _id: { $ne: appointment._id },
            patientId: appointment.patientId,
            status: "scheduled",
            startsAt: { $lt: newEndsAt },
            endsAt: { $gt: newStartsAt },
        });

        if (patientOverlap) {
            throw new ApiError(
                "Patient already has an overlapping appointment scheduled",
                409,
                true,
                "PATIENT_DOUBLE_BOOKED"
            );
        }

        const previousStartsAt = appointment.startsAt;
        const previousEndsAt = appointment.endsAt;
        appointment.startsAt = newStartsAt;
        appointment.endsAt = newEndsAt;

        try {
            await appointment.save();

            await auditService.record({
                action: "appointment.reschedule",
                entityType: "Appointment",
                entityId: appointment.id,
                outcome: "success",
                changes: [
                    { field: "startsAt", from: previousStartsAt, to: appointment.startsAt },
                    { field: "endsAt", from: previousEndsAt, to: appointment.endsAt },
                ],
            });

            return appointment;
        } catch (error: any) {
            if (error.code === 11000) {
                throw new ApiError(
                    "This appointment slot is already taken",
                    409,
                    true,
                    "SLOT_TAKEN"
                );
            }
            throw error;
        }
    }
}

export const appointmentService = new AppointmentService();
