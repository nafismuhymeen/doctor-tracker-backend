import { Doctor } from "../doctors/doctor.model.js";
import { Patient } from "../patients/patient.model.js";
import type { DashboardQueryInput } from "./dashboard.schema.js";

class DashboardService {
    /**
     * Resolve start and end dates based on user query.
     */
    private getDateRange(query: DashboardQueryInput): {
        rangeStartDate: Date;
        rangeEndDate: Date;
    } {
        const now = new Date();
        const end = query.endDate ? new Date(query.endDate) : new Date(now);
        end.setHours(23, 59, 59, 999);

        let start: Date;

        if (query.startDate) {
            start = new Date(query.startDate);
            start.setHours(0, 0, 0, 0);
        } else {
            switch (query.range) {
                case "7d":
                    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case "90d":
                    start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    break;
                case "1y":
                    start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    break;
                case "all":
                    start = new Date(0);
                    break;
                case "30d":
                default:
                    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
            }
            start.setHours(0, 0, 0, 0);
        }

        return { rangeStartDate: start, rangeEndDate: end };
    }

    /**
     * Retrieve aggregated statistics for the Admin Dashboard (§3 Data Visualization).
     */
    async getDashboardStats(query: DashboardQueryInput) {
        const { rangeStartDate, rangeEndDate } = this.getDateRange(query);

        const [
            totalDoctors,
            totalPatients,
            patientsPerDoctorList,
            doctorRegistrationTrend,
            patientRegistrationTrend,
            specializationStats,
            topConditions,
        ] = await Promise.all([
            // 1. Total counts
            Doctor.countDocuments(),
            Patient.countDocuments(),

            // 2. Patients per doctor aggregation
            Doctor.aggregate([
                {
                    $lookup: {
                        from: "patients",
                        localField: "_id",
                        foreignField: "doctorId",
                        as: "patients",
                    },
                },
                {
                    $project: {
                        _id: 1,
                        doctorId: "$_id",
                        name: 1,
                        specialization: 1,
                        hospital: 1,
                        patientCount: { $size: "$patients" },
                    },
                },
                { $sort: { patientCount: -1, name: 1 } },
            ]),

            // 3. Date-based statistics: Doctor registrations
            Doctor.aggregate([
                {
                    $match: {
                        createdAt: {
                            $gte: rangeStartDate,
                            $lte: rangeEndDate,
                        },
                    },
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$createdAt",
                            },
                        },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),

            // 4. Date-based statistics: Patient registrations
            Patient.aggregate([
                {
                    $match: {
                        createdAt: {
                            $gte: rangeStartDate,
                            $lte: rangeEndDate,
                        },
                    },
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$createdAt",
                            },
                        },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),

            // 5. Specialization breakdown (insights)
            Doctor.aggregate([
                {
                    $group: {
                        _id: "$specialization",
                        doctorCount: { $sum: 1 },
                    },
                },
                { $sort: { doctorCount: -1 } },
                { $limit: 8 },
                {
                    $project: {
                        _id: 0,
                        specialization: "$_id",
                        doctorCount: 1,
                    },
                },
            ]),

            // 6. Top patient conditions (insights)
            Patient.aggregate([
                {
                    $group: {
                        _id: "$condition",
                        patientCount: { $sum: 1 },
                    },
                },
                { $sort: { patientCount: -1 } },
                { $limit: 8 },
                {
                    $project: {
                        _id: 0,
                        condition: "$_id",
                        patientCount: 1,
                    },
                },
            ]),
        ]);

        // Merge daily trend into a continuous date list for easy charting
        const timelineMap = new Map<
            string,
            { date: string; doctors: number; patients: number }
        >();

        for (const item of doctorRegistrationTrend) {
            timelineMap.set(item._id, {
                date: item._id,
                doctors: item.count,
                patients: 0,
            });
        }

        for (const item of patientRegistrationTrend) {
            const existing = timelineMap.get(item._id);
            if (existing) {
                existing.patients = item.count;
            } else {
                timelineMap.set(item._id, {
                    date: item._id,
                    doctors: 0,
                    patients: item.count,
                });
            }
        }

        const dateWiseStats = Array.from(timelineMap.values()).sort((a, b) =>
            a.date.localeCompare(b.date)
        );

        // Patients per doctor calculations
        const avgPatientsPerDoctor =
            totalDoctors > 0
                ? Number((totalPatients / totalDoctors).toFixed(1))
                : 0;

        return {
            summary: {
                totalDoctors,
                totalPatients,
                averagePatientsPerDoctor: avgPatientsPerDoctor,
            },
            patientsPerDoctor: {
                average: avgPatientsPerDoctor,
                topDoctors: patientsPerDoctorList.slice(0, 10),
                allDoctors: patientsPerDoctorList,
            },
            dateWiseStats: {
                range: query.range,
                startDate: rangeStartDate.toISOString(),
                endDate: rangeEndDate.toISOString(),
                timeline: dateWiseStats,
            },
            insights: {
                specializationStats,
                topConditions,
            },
        };
    }
}

export const dashboardService = new DashboardService();

