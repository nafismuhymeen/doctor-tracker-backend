import mongoose from "mongoose";
import { ApiError } from "../../utils/api-error.js";
import { escapeRegex } from "../../utils/escape-regex.js";
import { withTransaction } from "../../utils/with-transaction.js";
import { Doctor } from "./doctor.model.js";
import { Patient } from "../patients/patient.model.js";
import { Appointment } from "../appointments/appointment.model.js";
import { auditService } from "../audit/audit.service.js";
import { diffObjects } from "../audit/audit.util.js";
import type {
    CreateDoctorInput,
    DoctorQueryInput,
    UpdateDoctorInput,
} from "./doctor.schema.js";

class DoctorService {
    async create(input: CreateDoctorInput) {
        // Enforce uniqueness among active doctors
        const existing = await Doctor.findOne({
            email: input.email.toLowerCase(),
            isDeleted: false,
        });

        if (existing) {
            throw new ApiError("A doctor with this email already exists", 409);
        }

        const doctor = await Doctor.create({
            ...input,
            isDeleted: false,
            deletedAt: null,
        });

        await auditService.record({
            action: "doctor.create",
            entityType: "Doctor",
            entityId: doctor.id,
            outcome: "success",
            changes: [
                { field: "name", to: doctor.name },
                { field: "specialization", to: doctor.specialization },
                { field: "hospital", to: doctor.hospital },
                { field: "email", to: doctor.email },
            ],
        });

        return doctor;
    }

    async getById(doctorId: string) {
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const doctor = await Doctor.findOne({
            _id: doctorId,
            isDeleted: false,
        });

        if (!doctor) {
            throw new ApiError("Doctor not found", 404);
        }

        return doctor;
    }

    async getAll(query: DoctorQueryInput) {
        const {
            page,
            limit,
            search,
            specialization,
            hospital,
            startDate,
            endDate,
        } = query;

        const filter: Record<string, unknown> = {
            isDeleted: false,
        };

        // Search by doctor name with escaped regex
        if (search) {
            filter.name = {
                $regex: escapeRegex(search),
                $options: "i",
            };
        }

        // Filter by specialization with escaped regex
        if (specialization) {
            filter.specialization = {
                $regex: escapeRegex(specialization),
                $options: "i",
            };
        }

        // Filter by hospital with escaped regex
        if (hospital) {
            filter.hospital = {
                $regex: escapeRegex(hospital),
                $options: "i",
            };
        }

        // Filter by creation date
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

        const [doctors, totalDoctors] = await Promise.all([
            Doctor.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            Doctor.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalDoctors / limit);

        return {
            doctors,
            pagination: {
                currentPage: page,
                limit,
                totalDoctors,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    async update(doctorId: string, input: UpdateDoctorInput) {
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const doctor = await Doctor.findOne({
            _id: doctorId,
            isDeleted: false,
        });

        if (!doctor) {
            throw new ApiError("Doctor not found", 404);
        }

        // Check email uniqueness if email is being updated
        if (input.email && input.email.toLowerCase() !== doctor.email) {
            const emailInUse = await Doctor.findOne({
                email: input.email.toLowerCase(),
                isDeleted: false,
                _id: { $ne: doctorId },
            });

            if (emailInUse) {
                throw new ApiError(
                    "A doctor with this email already exists",
                    409
                );
            }
        }

        const before = doctor.toObject();

        const updatedDoctor = await Doctor.findOneAndUpdate(
            { _id: doctorId, isDeleted: false },
            input,
            { returnDocument: "after", runValidators: true }
        );

        if (!updatedDoctor) {
            throw new ApiError("Doctor not found", 404);
        }

        const after = updatedDoctor.toObject();
        const changes = diffObjects(before, after);

        await auditService.record({
            action: "doctor.update",
            entityType: "Doctor",
            entityId: doctorId,
            outcome: "success",
            changes,
        });

        return updatedDoctor;
    }

    async delete(doctorId: string, reassignToDoctorId?: string) {
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const doctor = await Doctor.findOne({
            _id: doctorId,
            isDeleted: false,
        });

        if (!doctor) {
            throw new ApiError("Doctor not found", 404);
        }

        // Refuse deletion if doctor has future scheduled appointments
        const futureAppointmentsCount = await Appointment.countDocuments({
            doctorId,
            status: "scheduled",
            startsAt: { $gte: new Date() },
        });

        if (futureAppointmentsCount > 0) {
            throw new ApiError(
                `Cannot delete doctor with ${futureAppointmentsCount} future scheduled appointments. Cancel or complete them first.`,
                409,
                true,
                "DOCTOR_HAS_APPOINTMENTS"
            );
        }

        const patientCount = await Patient.countDocuments({
            doctorId,
            isDeleted: false,
        });

        if (patientCount > 0) {
            if (!reassignToDoctorId) {
                throw new ApiError(
                    `Cannot delete doctor with ${patientCount} assigned patients. Reassign patients first by providing reassignToDoctorId query parameter.`,
                    400
                );
            }

            if (!mongoose.Types.ObjectId.isValid(reassignToDoctorId)) {
                throw new ApiError("Invalid reassignment doctor ID", 400);
            }

            if (reassignToDoctorId === doctorId) {
                throw new ApiError(
                    "Cannot reassign patients to the doctor being deleted",
                    400
                );
            }

            const targetDoctor = await Doctor.findOne({
                _id: reassignToDoctorId,
                isDeleted: false,
            });

            if (!targetDoctor) {
                throw new ApiError(
                    "Reassignment target doctor not found or inactive",
                    404
                );
            }
        }

        await withTransaction(async (session) => {
            const opts = session ? { session } : {};

            if (reassignToDoctorId && patientCount > 0) {
                await Patient.updateMany(
                    { doctorId, isDeleted: false },
                    { doctorId: reassignToDoctorId },
                    opts
                );
            }

            await Doctor.updateOne(
                { _id: doctorId },
                { isDeleted: true, deletedAt: new Date() },
                opts
            );
        });

        await auditService.record({
            action: "doctor.delete",
            entityType: "Doctor",
            entityId: doctorId,
            outcome: "success",
            metadata: {
                reason: reassignToDoctorId
                    ? `Reassigned ${patientCount} patients to doctor ${reassignToDoctorId}`
                    : undefined,
            },
        });

        return {
            id: doctorId,
            reassignedPatientsCount: reassignToDoctorId ? patientCount : 0,
            reassignToDoctorId: reassignToDoctorId || null,
        };
    }
}

export const doctorService = new DoctorService();
