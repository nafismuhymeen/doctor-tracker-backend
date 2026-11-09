import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Doctor } from "../modules/doctors/doctor.model.js";

const backfillDoctors = async (): Promise<void> => {
    try {
        await connectDatabase();
        console.log("Connected to MongoDB for doctor backfill and index verification...");

        // 1. Backfill isDeleted and deletedAt for any doctors lacking the fields
        const updateResult = await Doctor.updateMany(
            { isDeleted: { $exists: false } },
            { $set: { isDeleted: false, deletedAt: null } }
        );
        console.log(`Backfilled isDeleted: false on ${updateResult.modifiedCount} doctor records.`);

        const deletedAtResult = await Doctor.updateMany(
            { deletedAt: { $exists: false } },
            { $set: { deletedAt: null } }
        );
        console.log(`Backfilled deletedAt: null on ${deletedAtResult.modifiedCount} doctor records.`);

        // 2. Check for duplicate emails among non-deleted doctors before creating unique index
        const duplicates = await Doctor.aggregate([
            { $match: { isDeleted: false } },
            {
                $group: {
                    _id: "$email",
                    count: { $sum: 1 },
                    ids: { $push: "$_id" },
                },
            },
            { $match: { count: { $gt: 1 } } },
        ]);

        if (duplicates.length > 0) {
            console.error("WARNING: Duplicate emails detected among active doctors:");
            for (const dup of duplicates) {
                console.error(`  - Email: ${dup._id} (Count: ${dup.count}, IDs: ${dup.ids.join(", ")})`);
            }
        } else {
            console.log("Verified: No duplicate emails exist among active doctors.");
        }

        // 3. Drop legacy email indexes if any and synchronize indexes
        console.log("Synchronizing MongoDB indexes with Mongoose schema...");
        await Doctor.syncIndexes();

        // 4. Inspect and print active collection indexes
        const activeIndexes = await Doctor.collection.getIndexes();
        console.log("\nVerified Doctor Collection Indexes (getIndexes):");
        console.log(JSON.stringify(activeIndexes, null, 2));

        console.log("\nDoctor backfill and index verification completed successfully.");
    } catch (error) {
        console.error("Doctor backfill failed:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed.");
    }
};

backfillDoctors();

