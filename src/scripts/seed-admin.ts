import mongoose from "mongoose";

import { env } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { User } from "../modules/users/user.model.js";
import { hashPassword } from "../utils/password.js";

const seedAdmin = async (): Promise<void> => {
    try {
        const name = env.ADMIN_NAME;
        const email = env.ADMIN_EMAIL?.toLowerCase().trim();
        const password = env.ADMIN_PASSWORD;

        if (!name || !email || !password) {
            throw new Error(
                "ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required in environment."
            );
        }

        if (password.length < 8) {
            throw new Error("Admin password must be at least 8 characters.");
        }

        await connectDatabase();

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            console.log("An admin user with this email already exists.");
            return;
        }

        const passwordHash = await hashPassword(password);

        await User.create({
            name,
            email,
            passwordHash,
            role: "admin",
            isActive: true,
            tokenVersion: 0,
        });

        console.log("Initial admin user created successfully.");
    } catch (error) {
        console.error("Admin seeding failed:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

seedAdmin();
