import { ApiError } from "../../utils/api-error.js";
import { Doctor } from "./doctor.model.js";
import type { CreateDoctorInput, DoctorQueryInput } from "./doctor.schema.js";

class DoctorService {
    async create(input: CreateDoctorInput) {
        const doctor = await Doctor.create(input);

        return doctor;
    }

    async getById(doctorId: string) {
        const doctor = await Doctor.findById(doctorId);

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

        const filter: Record<string, unknown> = {};

        // Search by doctor name
        if (search) {
            filter.name = {
                $regex: search,
                $options: "i",
            };
        }

        // Filter by specialization
        if (specialization) {
            filter.specialization = {
                $regex: specialization,
                $options: "i",
            };
        }

        // Filter by hospital
        if (hospital) {
            filter.hospital = {
                $regex: hospital,
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
}

export const doctorService = new DoctorService();