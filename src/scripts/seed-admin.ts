import "dotenv/config";

import mongoose from "mongoose";

import { connectDatabase } from "../config/database.js";
import { Admin } from "../modules/admins/admin.model.js";
import { hashPassword } from "../utils/password.js";

const seedAdmin = async (): Promise<void> => {
    try {
        const name = process.env.ADMIN_NAME;
        const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
        const password = process.env.ADMIN_PASSWORD;

        if (!name || !email || !password) {
            throw new Error(
                "ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required."
            );
        }

        if (password.length < 8) {
            throw new Error("Admin password must be at least 8 characters.");
        }

        await connectDatabase();

        const existingAdmin = await Admin.findOne({ email });

        if (existingAdmin) {
            console.log("An admin with this email already exists.");
            return;
        }

        const passwordHash = await hashPassword(password);

        await Admin.create({
            name,
            email,
            passwordHash,
        });

        console.log("Initial admin account created successfully.");
    } catch (error) {
        console.error("Admin seeding failed:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

await seedAdmin();