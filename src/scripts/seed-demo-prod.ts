import mongoose from "mongoose";
import { DateTime } from "luxon";
import { env } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { Doctor } from "../modules/doctors/doctor.model.js";
import { Patient } from "../modules/patients/patient.model.js";
import { Appointment } from "../modules/appointments/appointment.model.js";
import { Visit } from "../modules/visits/visit.model.js";
import { User } from "../modules/users/user.model.js";
import { hashPassword } from "../utils/password.js";
import { demoDoctors, patientNames } from "./seed-demo.js";

export interface DemoProdSeedOptions {
    nodeEnv?: string;
    allowDemoSeed?: boolean;
    adminEmail?: string;
    adminName?: string;
    adminPassword?: string;
    demoViewerEmail?: string;
    demoViewerPassword?: string;
    allowSeedReset?: boolean;
    disconnectOnComplete?: boolean;
}

export function validateDemoProdEnv(options: DemoProdSeedOptions = {}) {
    const nodeEnv = options.nodeEnv ?? env.NODE_ENV;
    const allowDemoSeed = options.allowDemoSeed ?? env.ALLOW_DEMO_SEED;
    const adminPassword = options.adminPassword ?? env.ADMIN_PASSWORD;
    const demoViewerEmail = options.demoViewerEmail ?? env.DEMO_VIEWER_EMAIL;
    const demoViewerPassword = options.demoViewerPassword ?? env.DEMO_VIEWER_PASSWORD;

    // Production environment guard
    if (nodeEnv === "production" && !allowDemoSeed) {
        throw new Error(
            "FATAL: Demo seed in production is disabled. Set ALLOW_DEMO_SEED=true to enable."
        );
    }

    // Admin password guards
    if (!adminPassword) {
        throw new Error(
            "FATAL: ADMIN_PASSWORD is required for production demo seed."
        );
    }

    if (adminPassword.length < 12) {
        throw new Error(
            "FATAL: ADMIN_PASSWORD must be at least 12 characters long for production demo seed."
        );
    }

    if (adminPassword === "Password123!") {
        throw new Error(
            "FATAL: ADMIN_PASSWORD cannot be the default insecure password 'Password123!'."
        );
    }

    // Viewer credential guards
    if (!demoViewerEmail || !demoViewerPassword) {
        throw new Error(
            "FATAL: DEMO_VIEWER_EMAIL and DEMO_VIEWER_PASSWORD are required for production demo seed."
        );
    }
}

export async function runDemoProdSeed(options: DemoProdSeedOptions = {}) {
    validateDemoProdEnv(options);

    console.log("Starting production-safe demo data seeding...");
    await connectDatabase();

    try {
        const allowSeedReset = options.allowSeedReset ?? env.ALLOW_SEED_RESET;
        if (allowSeedReset) {
            console.log("ALLOW_SEED_RESET=true: Purging prior synthetic collections...");
            await Promise.all([
                Doctor.deleteMany({}),
                Patient.deleteMany({}),
                Appointment.deleteMany({}),
                Visit.deleteMany({}),
            ]);
            console.log("Collections cleared.");
        }

        // 1. Seed or retrieve demo doctors (profiles only, NO User accounts with known passwords)
        const createdDoctors: any[] = [];
        for (const docData of demoDoctors) {
            let doc = await Doctor.findOne({ email: docData.email, isDeleted: false });
            if (!doc) {
                doc = await Doctor.create({ ...docData, isDeleted: false });
                console.log(`Created doctor: ${doc.name} (${doc.specialization})`);
            }
            createdDoctors.push(doc);
        }

        // 2. Seed production-safe users:
        // ONLY admin (with strong password) and viewer (from DEMO_VIEWER_EMAIL / DEMO_VIEWER_PASSWORD)
        // DO NOT CREATE staff or doctor accounts with known passwords.
        const adminEmail = (options.adminEmail ?? env.ADMIN_EMAIL ?? "admin@doctortracker.com").toLowerCase();
        const adminName = options.adminName ?? env.ADMIN_NAME ?? "Healthcare Admin";
        const adminPassword = options.adminPassword ?? env.ADMIN_PASSWORD!;
        const adminHash = await hashPassword(adminPassword);

        const viewerEmail = (options.demoViewerEmail ?? env.DEMO_VIEWER_EMAIL!).toLowerCase();
        const viewerPassword = options.demoViewerPassword ?? env.DEMO_VIEWER_PASSWORD!;
        const viewerHash = await hashPassword(viewerPassword);

        // Seed / update Admin
        let adminUser = await User.findOne({ email: adminEmail });
        if (!adminUser) {
            adminUser = await User.create({
                name: adminName,
                email: adminEmail,
                passwordHash: adminHash,
                role: "admin",
                isActive: true,
                tokenVersion: 0,
            });
            console.log(`Created admin user: ${adminEmail}`);
        } else {
            console.log(`Admin user already exists: ${adminEmail}`);
        }

        // Seed / update Demo Viewer
        let viewerUser = await User.findOne({ email: viewerEmail });
        if (!viewerUser) {
            viewerUser = await User.create({
                name: "Demo Readonly Viewer",
                email: viewerEmail,
                passwordHash: viewerHash,
                role: "viewer",
                isActive: true,
                tokenVersion: 0,
            });
            console.log(`Created demo viewer user: ${viewerEmail}`);
        } else {
            console.log(`Viewer user already exists: ${viewerEmail}`);
        }

        // 3. Seed patients
        const createdPatients: any[] = [];
        for (let i = 0; i < patientNames.length; i++) {
            const pData = patientNames[i];
            const assignedDoctor = createdDoctors[i % createdDoctors.length];

            let p = await Patient.findOne({ phone: pData.phone, isDeleted: false });
            if (!p) {
                p = await Patient.create({
                    ...pData,
                    doctorId: assignedDoctor._id,
                    isDeleted: false,
                });
                console.log(`Created patient: ${p.name} assigned to ${assignedDoctor.name}`);
            }
            createdPatients.push(p);
        }

        // 4. Seed appointments and clinical notes for realistic demo exploration
        const now = DateTime.utc();
        let appointmentCount = 0;
        let visitCount = 0;

        for (let i = 0; i < createdPatients.length; i++) {
            const patient = createdPatients[i];
            const doctor = createdDoctors[i % createdDoctors.length];

            // Past appointment
            const pastDays = 5 + i * 3;
            const pastSlot = now.minus({ days: pastDays }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
            const pastEnd = pastSlot.plus({ minutes: doctor.slotMinutes });

            const pastStatus = i % 4 === 0 ? "cancelled" : i % 5 === 0 ? "no_show" : "completed";
            const cancelReason = pastStatus === "cancelled" ? "Patient had conflict" : undefined;

            let pastAppt = await Appointment.findOne({ doctorId: doctor._id, startsAt: pastSlot.toJSDate() });
            if (!pastAppt) {
                pastAppt = await Appointment.create({
                    doctorId: doctor._id,
                    patientId: patient._id,
                    startsAt: pastSlot.toJSDate(),
                    endsAt: pastEnd.toJSDate(),
                    status: pastStatus,
                    cancelReason,
                    reason: `Consultation for ${patient.condition}`,
                    createdBy: adminUser._id,
                });
                appointmentCount++;

                if (pastStatus === "completed") {
                    const existingVisit = await Visit.findOne({ appointmentId: pastAppt._id });
                    if (!existingVisit) {
                        await Visit.create({
                            doctorId: doctor._id,
                            patientId: patient._id,
                            appointmentId: pastAppt._id,
                            visitDate: pastSlot.toJSDate(),
                            chiefComplaint: `Routine checkup for ${patient.condition}`,
                            diagnosis: `${patient.condition} - stable under treatment`,
                            notes: "Patient reports steady improvement. Recommended routine exercise and continued medication.",
                            vitals: {
                                bpSystolic: 120,
                                bpDiastolic: 80,
                                heartRate: 72,
                                temperatureC: 36.8,
                                weightKg: 70 + i * 2,
                            },
                            prescriptions: [
                                { drug: "Daily Multivitamin", dose: "1 tablet", frequency: "once daily", durationDays: 30 },
                            ],
                            createdBy: adminUser._id,
                        });
                        visitCount++;
                    }
                }
            }

            // Future scheduled appointment
            const futureDays = 1 + i * 2;
            const futureSlot = now.plus({ days: futureDays }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
            const futureEnd = futureSlot.plus({ minutes: doctor.slotMinutes });

            const existingFuture = await Appointment.findOne({ doctorId: doctor._id, startsAt: futureSlot.toJSDate() });
            if (!existingFuture) {
                await Appointment.create({
                    doctorId: doctor._id,
                    patientId: patient._id,
                    startsAt: futureSlot.toJSDate(),
                    endsAt: futureEnd.toJSDate(),
                    status: "scheduled",
                    reason: `Follow-up appointment for ${patient.condition}`,
                    createdBy: adminUser._id,
                });
                appointmentCount++;
            }
        }

        console.log("\n==========================================");
        console.log("Production Demo Seeding Completed Successfully!");
        console.log(`Doctors:      ${createdDoctors.length}`);
        console.log(`Patients:     ${createdPatients.length}`);
        console.log(`Appointments: ${appointmentCount} new entries`);
        console.log(`Visits:       ${visitCount} new clinical notes`);
        console.log(`Admin User:   ${adminEmail}`);
        console.log(`Viewer User:  ${viewerEmail}`);
        console.log("Staff/Doctor Accounts with default passwords: NONE");
        console.log("==========================================\n");

        return {
            adminEmail,
            viewerEmail,
            doctorsCount: createdDoctors.length,
            patientsCount: createdPatients.length,
            appointmentCount,
            visitCount,
        };
    } finally {
        if (options.disconnectOnComplete ?? true) {
            await mongoose.disconnect();
        }
    }
}

// Execute directly if run as CLI
if (process.argv[1]?.endsWith("seed-demo-prod.ts") || process.argv[1]?.endsWith("seed-demo-prod.js")) {
    runDemoProdSeed().catch((err) => {
        console.error("Production demo seed failed:", err.message);
        process.exit(1);
    });
}
