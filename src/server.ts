import "dotenv/config";

import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async (): Promise<void> => {
    try {
        await connectDatabase();

        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

        const shutdown = (signal: string) => {
            console.log(`${signal} received. Shutting down...`);

            server.close(async () => {
                await import("mongoose").then(({ default: mongoose }) =>
                    mongoose.disconnect()
                );

                console.log("Server and database connections closed.");
                process.exit(0);
            });
        };

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();
