import mongoose from "mongoose";
import { Visit } from "./visit.model.js";
import { Patient } from "../patients/patient.model.js";
import { Appointment } from "../appointments/appointment.model.js";
import { ApiError } from "../../utils/api-error.js";
import { withTransaction } from "../../utils/with-transaction.js";
import { env } from "../../config/env.js";
import { auditService } from "../audit/audit.service.js";
import { diffObjects } from "../audit/audit.util.js";
import type { UserContext } from "../../utils/scope.js";
import type {
    CreateAddendumInput,
    CreateVisitInput,
    UpdateVisitInput,
    VisitQueryInput,
} from "./visit.schema.js";

class VisitService {
    /**
     * Create a new clinical visit (Treating doctor only).
     */
    async create(input: CreateVisitInput, user: UserContext) {
        if (user.role !== "doctor" || !user.doctorId) {
            throw new ApiError(
                "Only treating doctors can create clinical visits",
                403,
                true,
                "FORBIDDEN"
            );
        }

        const doctorId = user.doctorId;

        // Verify patient exists and belongs to this doctor
        const patient = await Patient.findOne({
            _id: input.patientId,
            isDeleted: false,
        });

        if (!patient || patient.doctorId.toString() !== doctorId) {
            throw new ApiError("Patient not found", 404);
        }

        let appointmentToComplete: any = null;

        if (input.appointmentId) {
            const appointment = await Appointment.findById(input.appointmentId);
            if (
                !appointment ||
                appointment.doctorId.toString() !== doctorId ||
                appointment.patientId.toString() !== input.patientId
            ) {
                throw new ApiError(
                    "Appointment not found or does not match patient and doctor",
                    404
                );
            }

            const now = new Date();
            if (
                appointment.status === "scheduled" &&
                appointment.startsAt > now
            ) {
                throw new ApiError(
                    "Cannot link a future scheduled appointment to a clinical visit",
                    400
                );
            }

            if (
                appointment.status !== "completed" &&
                appointment.status !== "scheduled"
            ) {
                throw new ApiError(
                    `Cannot link an appointment with status '${appointment.status}' to a clinical visit`,
                    400
                );
            }

            if (appointment.status === "scheduled") {
                appointmentToComplete = appointment;
            }
        }

        try {
            return await withTransaction(async (session) => {
                const opts = session ? { session } : {};

                const [visit] = await Visit.create(
                    [
                        {
                            patientId: input.patientId,
                            doctorId,
                            appointmentId: input.appointmentId || undefined,
                            visitDate: input.visitDate || new Date(),
                            chiefComplaint: input.chiefComplaint,
                            diagnosis: input.diagnosis,
                            notes: input.notes,
                            vitals: input.vitals,
                            prescriptions: input.prescriptions || [],
                            followUpDate: input.followUpDate || undefined,
                            createdBy: user.id,
                        },
                    ],
                    opts
                );

                if (appointmentToComplete) {
                    appointmentToComplete.status = "completed";
                    await appointmentToComplete.save(opts);
                }

                await auditService.record({
                    action: "visit.create",
                    entityType: "Visit",
                    entityId: visit.id,
                    outcome: "success",
                    changes: [
                        { field: "patientId", to: visit.patientId },
                        { field: "doctorId", to: visit.doctorId },
                        { field: "visitDate", to: visit.visitDate },
                    ],
                });

                return visit;
            });
        } catch (error: any) {
            if (error.code === 11000) {
                throw new ApiError(
                    "A clinical visit has already been recorded for this appointment",
                    409,
                    true,
                    "VISIT_EXISTS"
                );
            }
            throw error;
        }
    }

    /**
     * Get paginated clinical timeline for a patient (Admin and treating doctor only).
     */
    async getByPatientId(
        patientId: string,
        query: VisitQueryInput,
        user: UserContext
    ) {
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError("Invalid patient ID", 400);
        }

        const patient = await Patient.findOne({
            _id: patientId,
            isDeleted: false,
        });

        if (!patient) {
            throw new ApiError("Patient not found", 404);
        }

        if (user.role === "doctor" && patient.doctorId.toString() !== user.doctorId) {
            throw new ApiError("Patient not found", 404);
        }

        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [visits, totalVisits] = await Promise.all([
            Visit.find({ patientId })
                .sort({ visitDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("doctorId", "name specialization hospital")
                .lean(),
            Visit.countDocuments({ patientId }),
        ]);

        const totalPages = Math.ceil(totalVisits / limit);

        void auditService.record({
            action: "visit.list",
            entityType: "Patient",
            entityId: patientId,
            outcome: "success",
        });

        return {
            visits,
            pagination: {
                currentPage: page,
                limit,
                totalVisits,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    /**
     * Get a single visit by ID (Admin and treating doctor only).
     */
    async getById(id: string, user: UserContext) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError("Invalid visit ID", 400);
        }

        const visit = await Visit.findById(id)
            .populate("doctorId", "name specialization hospital")
            .populate("patientId", "name phone email")
            .populate("createdBy", "name email role")
            .populate("addenda.by", "name email role")
            .lean();

        if (!visit) {
            throw new ApiError("Visit not found", 404);
        }

        if (user.role === "doctor") {
            const visitDoctorId = (visit.doctorId as any)?._id
                ? (visit.doctorId as any)._id.toString()
                : visit.doctorId.toString();
            if (visitDoctorId !== user.doctorId) {
                throw new ApiError("Visit not found", 404);
            }
        }

        await auditService.record({
            action: "visit.read",
            entityType: "Visit",
            entityId: id,
            outcome: "success",
        });

        return visit;
    }

    /**
     * Update an existing visit within the edit window (Treating doctor only).
     */
    async update(id: string, input: UpdateVisitInput, user: UserContext) {
        if (user.role !== "doctor" || !user.doctorId) {
            throw new ApiError(
                "Only treating doctors can edit clinical visits",
                403,
                true,
                "FORBIDDEN"
            );
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError("Invalid visit ID", 400);
        }

        const visit = await Visit.findById(id);
        if (!visit || visit.doctorId.toString() !== user.doctorId) {
            throw new ApiError("Visit not found", 404);
        }

        const before = visit.toObject();

        // Check edit window
        const elapsedHours =
            (Date.now() - visit.createdAt.getTime()) / (1000 * 60 * 60);

        if (elapsedHours > env.VISIT_EDIT_WINDOW_HOURS) {
            throw new ApiError(
                `The edit window for this clinical visit has expired (${env.VISIT_EDIT_WINDOW_HOURS} hours). Add an addendum instead.`,
                409,
                true,
                "EDIT_WINDOW_EXPIRED"
            );
        }

        if (input.chiefComplaint !== undefined) {
            visit.chiefComplaint = input.chiefComplaint;
        }
        if (input.diagnosis !== undefined) {
            visit.diagnosis = input.diagnosis;
        }
        if (input.notes !== undefined) {
            visit.notes = input.notes;
        }
        if (input.vitals !== undefined) {
            visit.vitals = input.vitals;
        }
        if (input.prescriptions !== undefined) {
            visit.prescriptions = input.prescriptions as any;
        }
        if (input.followUpDate !== undefined) {
            visit.followUpDate = input.followUpDate;
        }

        await visit.save();

        const after = visit.toObject();
        const changes = diffObjects(before, after);

        await auditService.record({
            action: "visit.update",
            entityType: "Visit",
            entityId: visit.id,
            outcome: "success",
            changes,
        });

        return visit;
    }

    /**
     * Append an addendum to an existing visit (Treating doctor only).
     */
    async addAddendum(
        id: string,
        input: CreateAddendumInput,
        user: UserContext
    ) {
        if (user.role !== "doctor" || !user.doctorId) {
            throw new ApiError(
                "Only treating doctors can add addenda to clinical visits",
                403,
                true,
                "FORBIDDEN"
            );
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError("Invalid visit ID", 400);
        }

        const visit = await Visit.findById(id);
        if (!visit || visit.doctorId.toString() !== user.doctorId) {
            throw new ApiError("Visit not found", 404);
        }

        visit.addenda.push({
            text: input.text,
            by: new mongoose.Types.ObjectId(user.id),
            at: new Date(),
        });

        await visit.save();

        await auditService.record({
            action: "visit.addendum",
            entityType: "Visit",
            entityId: visit.id,
            outcome: "success",
        });

        return visit;
    }
}

export const visitService = new VisitService();

