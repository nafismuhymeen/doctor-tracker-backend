import mongoose from "mongoose";
import { env } from "./env.js";

export const connectDatabase = async (): Promise<void> => {
    try {
        if (mongoose.connection.readyState === 1) {
            return;
        }
        await mongoose.connect(env.MONGODB_URI);

        console.log("MongoDB connected successfully");
    } catch (error) {
        console.error("MongoDB connection failed:", error);

        throw error;
    }
};
