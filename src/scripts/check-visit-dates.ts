import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Visit } from "../modules/visits/visit.model.js";

export interface SuspiciousVisit {
    id: string;
    patientId: string;
    doctorId: string;
    visitDate: Date;
    followUpDate?: Date | null;
    createdAt: Date;
}

export async function findSuspiciousVisits(
    cutoffDate: Date = new Date("2000-01-01T00:00:00.000Z")
): Promise<SuspiciousVisit[]> {
    const visits = await Visit.find({
        $or: [
            { followUpDate: { $lt: cutoffDate, $ne: null } },
            { visitDate: { $lt: cutoffDate } },
        ],
    }).lean();

    return visits.map((v) => ({
        id: v._id.toString(),
        patientId: v.patientId.toString(),
        doctorId: v.doctorId.toString(),
        visitDate: v.visitDate,
        followUpDate: v.followUpDate,
        createdAt: v.createdAt,
    }));
}

const run = async (): Promise<void> => {
    try {
        await connectDatabase();
        console.log("Connected to database. Checking visits for corrupted/epoch dates (< 2000)...\n");

        const cutoff = new Date("2000-01-01T00:00:00.000Z");
        const suspiciousVisits = await findSuspiciousVisits(cutoff);
        const totalVisits = await Visit.countDocuments({});

        console.log("==================================================");
        console.log("       CLINICAL VISIT DATE AUDIT REPORT           ");
        console.log("==================================================");
        console.log(`Total Visits Examined: ${totalVisits}`);
        console.log(`Visits with Dates Before Year 2000: ${suspiciousVisits.length}`);
        console.log("--------------------------------------------------");

        if (suspiciousVisits.length === 0) {
            console.log("\nNo suspicious or epoch-coerced visit dates found.");
        } else {
            console.log("\nThe following visits have dates before year 2000 (likely coerced from null/0):\n");
            for (const v of suspiciousVisits) {
                console.log(`Visit ID: ${v.id}`);
                console.log(`  Patient ID: ${v.patientId}`);
                console.log(`  Doctor ID:  ${v.doctorId}`);
                console.log(`  Visit Date: ${v.visitDate?.toISOString()}`);
                console.log(`  Follow-up:  ${v.followUpDate ? v.followUpDate.toISOString() : "N/A"}`);
                console.log(`  Created At: ${v.createdAt?.toISOString()}`);
                console.log("");
            }
            console.log("NOTE: This script is read-only. No records were modified.");
        }

        console.log("==================================================");
    } catch (error) {
        console.error("Error checking visit dates:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed.");
    }
};

// Execute if run directly from CLI
if (process.argv[1] && process.argv[1].includes("check-visit-dates")) {
    run();
}

