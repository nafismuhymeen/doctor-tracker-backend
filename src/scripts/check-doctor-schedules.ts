import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Doctor } from "../modules/doctors/doctor.model.js";
import { parseMinutes } from "../modules/doctors/doctor.schema.js";

interface ScheduleViolation {
    dayOfWeek: number;
    start: string;
    end: string;
    duration: number;
    remainder: number;
}

interface DoctorViolation {
    id: string;
    name: string;
    email: string;
    slotMinutes: number;
    violations: ScheduleViolation[];
}

export async function checkDoctorSchedules(): Promise<DoctorViolation[]> {
    const doctors = await Doctor.find({ isDeleted: false }).lean();
    const violatingDoctors: DoctorViolation[] = [];

    for (const doc of doctors) {
        const slotMinutes = doc.slotMinutes ?? 30;
        const workingHours = doc.workingHours ?? [];
        const violations: ScheduleViolation[] = [];

        for (const range of workingHours) {
            const startMin = parseMinutes(range.start);
            const endMin = parseMinutes(range.end);
            const duration = endMin - startMin;
            const remainder = duration % slotMinutes;

            if (remainder !== 0) {
                violations.push({
                    dayOfWeek: range.dayOfWeek,
                    start: range.start,
                    end: range.end,
                    duration,
                    remainder,
                });
            }
        }

        if (violations.length > 0) {
            violatingDoctors.push({
                id: doc._id.toString(),
                name: doc.name,
                email: doc.email,
                slotMinutes,
                violations,
            });
        }
    }

    return violatingDoctors;
}

const run = async (): Promise<void> => {
    try {
        await connectDatabase();
        console.log("Connected to database. Checking doctor schedules for slot alignment...\n");

        const violatingDoctors = await checkDoctorSchedules();
        const totalActiveDoctors = await Doctor.countDocuments({ isDeleted: false });

        console.log("==================================================");
        console.log("       DOCTOR SCHEDULE ALIGNMENT AUDIT REPORT     ");
        console.log("==================================================");
        console.log(`Total Active Doctors Checked: ${totalActiveDoctors}`);
        console.log(`Doctors with Unaligned Schedules: ${violatingDoctors.length}`);
        console.log("--------------------------------------------------");

        if (violatingDoctors.length === 0) {
            console.log("\nAll doctor schedules are properly aligned with their slotMinutes.");
        } else {
            console.log("\nThe following doctors have schedules that violate slotMinutes alignment:\n");
            for (const doc of violatingDoctors) {
                console.log(`Doctor: ${doc.name} (ID: ${doc.id})`);
                console.log(`Email: ${doc.email}`);
                console.log(`Configured Slot Minutes: ${doc.slotMinutes}`);
                console.log("Unaligned Working-Hour Ranges:");
                for (const v of doc.violations) {
                    console.log(
                        `  - Day ${v.dayOfWeek}: ${v.start}-${v.end} (${v.duration} min) -> ${v.duration} % ${doc.slotMinutes} = ${v.remainder} min leftover`
                    );
                }
                console.log("");
            }
            console.log("NOTE: This script is read-only. No data has been modified.");
        }

        console.log("==================================================");
    } catch (error) {
        console.error("Error checking doctor schedules:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed.");
    }
};

// Execute if run directly
if (process.argv[1] && process.argv[1].includes("check-doctor-schedules")) {
    run();
}

