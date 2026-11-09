import mongoose from "mongoose";
import { logger } from "../config/logger.js";

let warnedAboutNoTransactions = false;

/**
 * Runs a callback inside a Mongoose session transaction.
 * If running on a standalone MongoDB instance that does not support transactions,
 * it falls back gracefully to running the callback without a session/transaction,
 * logging a single warning.
 */
export async function withTransaction<T>(
    fn: (session?: mongoose.ClientSession) => Promise<T>
): Promise<T> {
    const session = await mongoose.startSession();

    try {
        let result: T;
        await session.withTransaction(async () => {
            result = await fn(session);
        });
        return result!;
    } catch (err: any) {
        const isUnsupported =
            err?.code === 20 ||
            err?.codeName === "IllegalOperation" ||
            err?.message?.includes(
                "Transaction numbers are only allowed on a replica set member or mongos"
            );

        if (isUnsupported) {
            if (!warnedAboutNoTransactions) {
                logger.warn(
                    "MongoDB instance does not support transactions (standalone instance). Falling back to non-transactional execution."
                );
                warnedAboutNoTransactions = true;
            }
            return await fn(undefined);
        }

        throw err;
    } finally {
        await session.endSession();
    }
}

