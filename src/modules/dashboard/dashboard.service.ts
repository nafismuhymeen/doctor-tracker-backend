import mongoose from "mongoose";
import { DateTime } from "luxon";
import { Doctor } from "../doctors/doctor.model.js";
import { Patient } from "../patients/patient.model.js";
import { Appointment } from "../appointments/appointment.model.js";
import type { UserContext } from "../../utils/scope.js";
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
            // 1. Total counts (excluding soft-deleted doctors and patients)
            Doctor.countDocuments({ isDeleted: false }),
            Patient.countDocuments({ isDeleted: false }),

            // 2. Patients per doctor aggregation (only active doctors and active patients)
            Doctor.aggregate([
                { $match: { isDeleted: false } },
                {
                    $lookup: {
                        from: "patients",
                        let: { docId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$doctorId", "$$docId"] },
                                    isDeleted: false,
                                },
                            },
                        ],
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

            // 3. Date-based statistics: Doctor registrations (only active doctors)
            Doctor.aggregate([
                {
                    $match: {
                        isDeleted: false,
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

            // 4. Date-based statistics: Patient registrations (only active patients)
            Patient.aggregate([
                {
                    $match: {
                        isDeleted: false,
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

            // 5. Specialization breakdown (only active doctors)
            Doctor.aggregate([
                { $match: { isDeleted: false } },
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

            // 6. Top patient conditions (only active patients)
            Patient.aggregate([
                { $match: { isDeleted: false } },
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

    /**
     * Retrieve aggregated statistics for Appointments Dashboard (Phase 2).
     */
    async getAppointmentDashboardStats(
        query: DashboardQueryInput,
        user: UserContext
    ) {
        const { rangeStartDate, rangeEndDate } = this.getDateRange(query);

        // Default clinic timezone
        const timezone = "Asia/Dhaka";
        const nowInTz = DateTime.now().setZone(timezone);
        const todayStart = nowInTz.startOf("day").toJSDate();
        const todayEnd = nowInTz.endOf("day").toJSDate();
        const next7DaysEnd = nowInTz.plus({ days: 7 }).endOf("day").toJSDate();

        const baseMatch: Record<string, unknown> = {};
        if (user.role === "doctor") {
            if (!user.doctorId) {
                baseMatch.doctorId = new mongoose.Types.ObjectId();
            } else {
                baseMatch.doctorId = new mongoose.Types.ObjectId(user.doctorId);
            }
        }

        const [facetResult] = await Appointment.aggregate([
            { $match: baseMatch },
            {
                $facet: {
                    today: [
                        {
                            $match: {
                                startsAt: { $gte: todayStart, $lte: todayEnd },
                            },
                        },
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    next7Days: [
                        {
                            $match: {
                                status: "scheduled",
                                startsAt: {
                                    $gte: nowInTz.startOf("day").toJSDate(),
                                    $lte: next7DaysEnd,
                                },
                            },
                        },
                        {
                            $group: {
                                _id: {
                                    $dateToString: {
                                        format: "%Y-%m-%d",
                                        date: "$startsAt",
                                        timezone,
                                    },
                                },
                                count: { $sum: 1 },
                            },
                        },
                        { $sort: { _id: 1 } },
                    ],
                    rangeStats: [
                        {
                            $match: {
                                startsAt: {
                                    $gte: rangeStartDate,
                                    $lte: rangeEndDate,
                                },
                            },
                        },
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    topDoctors: [
                        {
                            $match: {
                                status: "scheduled",
                                startsAt: {
                                    $gte: nowInTz.startOf("day").toJSDate(),
                                    $lte: next7DaysEnd,
                                },
                            },
                        },
                        {
                            $group: {
                                _id: "$doctorId",
                                scheduledCount: { $sum: 1 },
                            },
                        },
                        { $sort: { scheduledCount: -1 } },
                        { $limit: 5 },
                        {
                            $lookup: {
                                from: "doctors",
                                localField: "_id",
                                foreignField: "_id",
                                as: "doctor",
                            },
                        },
                        { $unwind: "$doctor" },
                        { $match: { "doctor.isDeleted": false } },
                        {
                            $project: {
                                _id: 0,
                                doctorId: "$_id",
                                name: "$doctor.name",
                                specialization: "$doctor.specialization",
                                hospital: "$doctor.hospital",
                                scheduledCount: 1,
                            },
                        },
                    ],
                },
            },
        ]);

        // 1. Process today counts
        const todayMap = new Map<string, number>();
        let todayTotal = 0;
        for (const item of facetResult.today) {
            todayMap.set(item._id, item.count);
            todayTotal += item.count;
        }

        const todayCounts = {
            total: todayTotal,
            scheduled: todayMap.get("scheduled") || 0,
            completed: todayMap.get("completed") || 0,
            cancelled: todayMap.get("cancelled") || 0,
            noShow: todayMap.get("no_show") || 0,
        };

        // 2. Process next 7 days counts
        const next7DaysMap = new Map<string, number>();
        for (const item of facetResult.next7Days) {
            next7DaysMap.set(item._id, item.count);
        }

        const next7DaysTimeline = [];
        for (let i = 0; i < 7; i++) {
            const dateStr = nowInTz.plus({ days: i }).toFormat("yyyy-MM-dd");
            next7DaysTimeline.push({
                date: dateStr,
                scheduledCount: next7DaysMap.get(dateStr) || 0,
            });
        }

        // 3. Process no-show rate
        let rangeTotal = 0;
        let rangeNoShow = 0;
        for (const item of facetResult.rangeStats) {
            rangeTotal += item.count;
            if (item._id === "no_show") {
                rangeNoShow += item.count;
            }
        }
        const noShowRate =
            rangeTotal > 0
                ? Number(((rangeNoShow / rangeTotal) * 100).toFixed(1))
                : 0;

        return {
            today: todayCounts,
            next7Days: next7DaysTimeline,
            noShowRate: {
                ratePercentage: noShowRate,
                noShowCount: rangeNoShow,
                totalAppointments: rangeTotal,
                range: query.range,
            },
            ...(user.role !== "doctor"
                ? { topBusiestDoctors: facetResult.topDoctors }
                : {}),
        };
    }
}

export const dashboardService = new DashboardService();
