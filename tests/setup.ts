import { beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDb, stopTestDb, clearDb } from "./helpers/db.js";

beforeAll(async () => {
    await startTestDb();
}, 60000);

beforeEach(async () => {
    await clearDb();
});

afterAll(async () => {
    await stopTestDb();
}, 30000);

