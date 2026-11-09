import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { User } from "../modules/users/user.model.js";

export const migrateAdminsToUsers = async (): Promise<void> => {
    try {
        await connectDatabase();
        console.log("Connected to MongoDB for admin-to-user migration...");

        // Ensure users collection indexes are synchronized
        await User.syncIndexes();

        const adminsCollection = mongoose.connection.collection("admins");
        const admins = await adminsCollection.find({}).toArray();
        console.log(`Found ${admins.length} existing admin records.`);

        let migratedCount = 0;
        let skippedCount = 0;

        for (const admin of admins) {
            const existingUser = await User.findById(admin._id);

            if (existingUser) {
                skippedCount++;
                continue;
            }

            // Check if email is already taken by another user
            const emailTaken = await User.findOne({ email: admin.email });
            if (emailTaken) {
                console.warn(
                    `Skipping admin ${admin.email} because user with same email exists with different ID.`
                );
                skippedCount++;
                continue;
            }

            await User.create({
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                passwordHash: admin.passwordHash,
                role: "admin",
                isActive: admin.isActive,
                tokenVersion: 0,
                createdAt: (admin as any).createdAt || new Date(),
                updatedAt: (admin as any).updatedAt || new Date(),
            });

            migratedCount++;
        }

        console.log(
            `Migration completed. Migrated: ${migratedCount}, Skipped: ${skippedCount}, Total Admins: ${admins.length}`
        );
    } catch (error) {
        console.error("Migration failed:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed.");
    }
};

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/")) {
    migrateAdminsToUsers();
}
