import mongoose from "mongoose";
import { env } from "./config/env.js";
import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { logger } from "./config/logger.js";

const PORT = env.PORT;

// Global process exception tracking via structured logger
process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception encountered; exiting process");
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection encountered; exiting process");
    process.exit(1);
});

const startServer = async (): Promise<void> => {
    try {
        await connectDatabase();

        const server = app.listen(PORT, () => {
            logger.info({ port: PORT, env: env.NODE_ENV }, `Server running on port ${PORT}`);
        });

        let isShuttingDown = false;

        const shutdown = (signal: string) => {
            if (isShuttingDown) return;
            isShuttingDown = true;

            logger.info({ signal }, `${signal} received. Initiating graceful shutdown...`);

            // Force exit after 10-second timeout if connections fail to close
            const forceExitTimer = setTimeout(() => {
                logger.error("Graceful shutdown timed out after 10 seconds. Forcing process exit.");
                process.exit(1);
            }, 10000);
            forceExitTimer.unref();

            server.close(async (err) => {
                if (err) {
                    logger.error({ err }, "Error closing HTTP server");
                }

                try {
                    await mongoose.disconnect();
                    logger.info("Database connection closed cleanly.");
                } catch (dbErr) {
                    logger.error({ err: dbErr }, "Error disconnecting from database");
                }

                logger.info("Graceful shutdown completed successfully. Exiting process.");
                process.exit(0);
            });
        };

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
    } catch (error) {
        logger.fatal({ err: error }, "Failed to start server");
        process.exit(1);
    }
};

startServer();
