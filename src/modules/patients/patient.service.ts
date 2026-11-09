import mongoose from "mongoose";
import { ApiError } from "../../utils/api-error.js";
import { escapeRegex } from "../../utils/escape-regex.js";
import { withTransaction } from "../../utils/with-transaction.js";
import type { UserContext } from "../../utils/scope.js";
import { Doctor } from "../doctors/doctor.model.js";
import { Patient } from "./patient.model.js";
import { Appointment } from "../appointments/appointment.model.js";
import { auditService } from "../audit/audit.service.js";
import { diffObjects } from "../audit/audit.util.js";
import type {
    CreatePatientInput,
    PatientQueryInput,
    UpdatePatientInput,
} from "./patient.schema.js";

class PatientService {
    async createUnderDoctor(
        doctorId: string,
        input: CreatePatientInput,
        user?: UserContext
    ) {
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            throw new ApiError("Invalid doctor ID", 400);
        }

        if (user?.role === "doctor" && (!user.doctorId || user.doctorId !== doctorId)) {
            throw new ApiError("Doctor not found or inactive", 404);
        }

        const doctor = await Doctor.findOne({ _id: doctorId, isDeleted: false });
        if (!doctor) {
            throw new ApiError("Doctor not found or inactive", 404);
        }

        const patient = await Patient.create({
            ...input,
            doctorId,
            email: input.email || undefined,
        });

        await auditService.record({
            action: "patient.create",
            entityType: "Patient",
            entityId: patient.id,
            outcome: "success",
            changes: [
                { field: "doctorId", to: doctorId },
                { field: "name", to: patient.name },
                { field: "age", to: patient.age },
                { field: "gender", to: patient.gender },
                { field: "phone", to: "[redacted]" },
                { field: "email", to: patient.email ? "[redacted]" : undefined },
            ],
        });

        return patient;
    }

    async getById(patientId: string, user?: UserContext) {
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError("Invalid patient ID", 400);
        }

        const filter: Record<string, unknown> = { _id: patientId, isDeleted: false };
        if (user?.role === "doctor") {
            if (!user.doctorId) {
                throw new ApiError("Patient not found", 404);
            }
            filter.doctorId = new mongoose.Types.ObjectId(user.doctorId);
        }

        const patient = await Patient.findOne(filter)
            .populate({
                path: "doctorId",
                match: { isDeleted: false },
                select: "name specialization hospital email phone",
            })
            .lean();

        if (!patient) {
            throw new ApiError("Patient not found", 404);
        }

        return patient;
    }

    async getAll(query: PatientQueryInput, user?: UserContext) {
        const {
            page,
            limit,
            search,
            condition,
            doctorId,
            startDate,
            endDate,
        } = query;

        const filter: Record<string, unknown> = { isDeleted: false };

        // Scope to doctor's own patients if role is doctor
        if (user?.role === "doctor") {
            if (!user.doctorId) {
                // Doctor has no doctorId linked - return empty
                filter.doctorId = new mongoose.Types.ObjectId();
            } else {
                if (doctorId && doctorId !== user.doctorId) {
                    throw new ApiError("Doctor not found or inactive", 404);
                }
                filter.doctorId = new mongoose.Types.ObjectId(user.doctorId);
            }
        } else if (doctorId) {
            if (!mongoose.Types.ObjectId.isValid(doctorId)) {
                throw new ApiError("Invalid doctor ID filter", 400);
            }
            const doctor = await Doctor.findOne({
                _id: doctorId,
                isDeleted: false,
            });
            if (!doctor) {
                throw new ApiError("Doctor not found or inactive", 404);
            }
            filter.doctorId = new mongoose.Types.ObjectId(doctorId);
        }

        // Search by patient name or phone with escaped regex
        if (search) {
            const escapedSearch = escapeRegex(search);
            filter.$or = [
                { name: { $regex: escapedSearch, $options: "i" } },
                { phone: { $regex: escapedSearch, $options: "i" } },
            ];
        }

        // Filter by condition with escaped regex
        if (condition) {
            filter.condition = {
                $regex: escapeRegex(condition),
                $options: "i",
            };
        }

        // Filter by creation date range
        if (startDate || endDate) {
            const createdAt: Record<string, Date> = {};

            if (startDate) {
                createdAt.$gte = startDate;
            }

            if (endDate) {
                const inclusiveEndDate = new Date(endDate);
                inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1);
                createdAt.$lt = inclusiveEndDate;
            }

            filter.createdAt = createdAt;
        }

        const skip = (page - 1) * limit;

        const [patients, totalPatients] = await Promise.all([
            Patient.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: "doctorId",
                    match: { isDeleted: false },
                    select: "name specialization hospital",
                })
                .lean(),
            Patient.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalPatients / limit);

        return {
            patients,
            pagination: {
                currentPage: page,
                limit,
                totalPatients,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    async update(
        patientId: string,
        input: UpdatePatientInput,
        user?: UserContext
    ) {
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError("Invalid patient ID", 400);
        }

        const filter: Record<string, unknown> = { _id: patientId, isDeleted: false };
        if (user?.role === "doctor") {
            if (!user.doctorId) {
                throw new ApiError("Patient not found", 404);
            }
            filter.doctorId = new mongoose.Types.ObjectId(user.doctorId);
        }

        const beforeDoc = await Patient.findOne(filter);
        if (!beforeDoc) {
            throw new ApiError("Patient not found", 404);
        }
        const before = beforeDoc.toObject();

        const patient = await Patient.findOneAndUpdate(
            filter,
            {
                ...input,
                email: input.email === "" ? undefined : input.email,
            },
            {
                returnDocument: "after",
                runValidators: true,
            }
        ).populate({
            path: "doctorId",
            match: { isDeleted: false },
            select: "name specialization hospital",
        });

        if (!patient) {
            throw new ApiError("Patient not found", 404);
        }

        const after = patient.toObject();
        const changes = diffObjects(before, after, { entityType: "Patient" });

        await auditService.record({
            action: "patient.update",
            entityType: "Patient",
            entityId: patient.id,
            outcome: "success",
            changes,
        });

        return patient;
    }

    async delete(patientId: string) {
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

        await withTransaction(async (session) => {
            const opts = session ? { session } : {};
            patient.isDeleted = true;
            patient.deletedAt = new Date();
            await patient.save(opts);

            await Appointment.updateMany(
                {
                    patientId: patient._id,
                    status: "scheduled",
                    startsAt: { $gte: new Date() },
                },
                {
                    status: "cancelled",
                    cancelReason: "Patient removed",
                },
                opts
            );
        });

        await auditService.record({
            action: "patient.delete",
            entityType: "Patient",
            entityId: patient.id,
            outcome: "success",
        });

        return patient;
    }

    async deleteUnderDoctor(doctorId: string, patientId: string) {
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            throw new ApiError("Invalid doctor ID", 400);
        }
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError("Invalid patient ID", 400);
        }

        const doctor = await Doctor.findOne({ _id: doctorId, isDeleted: false });
        if (!doctor) {
            throw new ApiError("Doctor not found or inactive", 404);
        }

        const patient = await Patient.findOne({
            _id: patientId,
            doctorId,
            isDeleted: false,
        });

        if (!patient) {
            throw new ApiError("Patient not found under this doctor", 404);
        }

        await withTransaction(async (session) => {
            const opts = session ? { session } : {};
            patient.isDeleted = true;
            patient.deletedAt = new Date();
            await patient.save(opts);

            await Appointment.updateMany(
                {
                    patientId: patient._id,
                    status: "scheduled",
                    startsAt: { $gte: new Date() },
                },
                {
                    status: "cancelled",
                    cancelReason: "Patient removed",
                },
                opts
            );
        });

        await auditService.record({
            action: "patient.delete",
            entityType: "Patient",
            entityId: patient.id,
            outcome: "success",
        });

        return patient;
    }
}

export const patientService = new PatientService();
