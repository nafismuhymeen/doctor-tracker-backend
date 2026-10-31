import mongoose from "mongoose";
import { ApiError } from "../../utils/api-error.js";
import { Doctor } from "../doctors/doctor.model.js";
import { Patient } from "./patient.model.js";
import type {
    CreatePatientInput,
    PatientQueryInput,
    UpdatePatientInput,
} from "./patient.schema.js";

class PatientService {
    async createUnderDoctor(doctorId: string, input: CreatePatientInput) {
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            throw new ApiError("Invalid doctor ID", 400);
        }

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            throw new ApiError("Doctor not found", 404);
        }

        const patient = await Patient.create({
            ...input,
            doctorId,
            email: input.email || undefined,
        });

        return patient;
    }

    async getById(patientId: string) {
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError("Invalid patient ID", 400);
        }

        const patient = await Patient.findById(patientId)
            .populate("doctorId", "name specialization hospital email phone")
            .lean();

        if (!patient) {
            throw new ApiError("Patient not found", 404);
        }

        return patient;
    }

    async getAll(query: PatientQueryInput) {
        const {
            page,
            limit,
            search,
            condition,
            doctorId,
            startDate,
            endDate,
        } = query;

        const filter: Record<string, unknown> = {};

        // Doctor filter
        if (doctorId) {
            if (!mongoose.Types.ObjectId.isValid(doctorId)) {
                throw new ApiError("Invalid doctor ID filter", 400);
            }
            filter.doctorId = new mongoose.Types.ObjectId(doctorId);
        }

        // Search by patient name or phone
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
            ];
        }

        // Filter by condition
        if (condition) {
            filter.condition = {
                $regex: condition,
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
                .populate("doctorId", "name specialization hospital")
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

    async update(patientId: string, input: UpdatePatientInput) {
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError("Invalid patient ID", 400);
        }

        const patient = await Patient.findByIdAndUpdate(
            patientId,
            {
                ...input,
                email: input.email === "" ? undefined : input.email,
            },
            {
                new: true,
                runValidators: true,
            }
        ).populate("doctorId", "name specialization hospital");

        if (!patient) {
            throw new ApiError("Patient not found", 404);
        }

        return patient;
    }

    async delete(patientId: string) {
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError("Invalid patient ID", 400);
        }

        const patient = await Patient.findByIdAndDelete(patientId);

        if (!patient) {
            throw new ApiError("Patient not found", 404);
        }

        return patient;
    }

    async deleteUnderDoctor(doctorId: string, patientId: string) {
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            throw new ApiError("Invalid doctor ID", 400);
        }
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError("Invalid patient ID", 400);
        }

        const patient = await Patient.findOneAndDelete({
            _id: patientId,
            doctorId,
        });

        if (!patient) {
            throw new ApiError("Patient not found under this doctor", 404);
        }

        return patient;
    }
}

export const patientService = new PatientService();
