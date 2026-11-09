import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { User } from "../../src/modules/users/user.model.js";
import { Doctor } from "../../src/modules/doctors/doctor.model.js";
import { Patient } from "../../src/modules/patients/patient.model.js";
import { Session } from "../../src/modules/auth/session.model.js";
import { Appointment } from "../../src/modules/appointments/appointment.model.js";
import { Visit } from "../../src/modules/visits/visit.model.js";
import { AuditLog } from "../../src/modules/audit/audit.model.js";

let replSet: MongoMemoryReplSet | null = null;

export async function startTestDb(): Promise<string> {
    replSet = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);

    // Ensure all model indexes are created
    await Promise.all([
        User.syncIndexes(),
        Doctor.syncIndexes(),
        Patient.syncIndexes(),
        Session.syncIndexes(),
        Appointment.syncIndexes(),
        Visit.syncIndexes(),
        AuditLog.syncIndexes(),
    ]);

    return uri;
}

export async function stopTestDb(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (replSet) {
        await replSet.stop();
        replSet = null;
    }
}

export async function clearDb(): Promise<void> {
    if (mongoose.connection.readyState === 0) return;
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
}

