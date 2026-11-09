import mongoose from "mongoose";
import { DateTime } from "luxon";
import { env } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { Doctor } from "../modules/doctors/doctor.model.js";
import { Patient } from "../modules/patients/patient.model.js";
import { Appointment } from "../modules/appointments/appointment.model.js";
import { Visit } from "../modules/visits/visit.model.js";
import { User, type Role } from "../modules/users/user.model.js";
import { hashPassword } from "../utils/password.js";

const demoDoctors = [
    {
        name: "Dr. Sarah Johnson",
        specialization: "Cardiology",
        hospital: "Mayo Clinic",
        phone: "+1 (555) 234-5678",
        email: "sarah.johnson@mayoclinic.org",
        timezone: "America/New_York",
        slotMinutes: 30,
        workingHours: [
            { dayOfWeek: 1, start: "09:00", end: "17:00" },
            { dayOfWeek: 2, start: "09:00", end: "17:00" },
            { dayOfWeek: 3, start: "09:00", end: "17:00" },
            { dayOfWeek: 4, start: "09:00", end: "17:00" },
            { dayOfWeek: 5, start: "09:00", end: "15:00" },
        ],
    },
    {
        name: "Dr. Marcus Chen",
        specialization: "Neurology",
        hospital: "Johns Hopkins Hospital",
        phone: "+1 (555) 345-6789",
        email: "marcus.chen@jhmi.edu",
        timezone: "America/New_York",
        slotMinutes: 45,
        workingHours: [
            { dayOfWeek: 1, start: "08:30", end: "16:30" },
            { dayOfWeek: 3, start: "08:30", end: "16:30" },
            { dayOfWeek: 5, start: "08:30", end: "14:00" },
        ],
    },
    {
        name: "Dr. Emily Rodriguez",
        specialization: "Pediatrics",
        hospital: "Boston Children's Hospital",
        phone: "+1 (555) 456-7890",
        email: "emily.rodriguez@childrens.harvard.edu",
        timezone: "America/New_York",
        slotMinutes: 30,
        workingHours: [
            { dayOfWeek: 1, start: "09:00", end: "16:00" },
            { dayOfWeek: 2, start: "09:00", end: "16:00" },
            { dayOfWeek: 3, start: "09:00", end: "16:00" },
            { dayOfWeek: 4, start: "09:00", end: "16:00" },
        ],
    },
    {
        name: "Dr. James Wilson",
        specialization: "Orthopedics",
        hospital: "Cleveland Clinic",
        phone: "+1 (555) 567-8901",
        email: "james.wilson@ccf.org",
        timezone: "America/New_York",
        slotMinutes: 30,
        workingHours: [
            { dayOfWeek: 2, start: "08:00", end: "16:00" },
            { dayOfWeek: 4, start: "08:00", end: "16:00" },
            { dayOfWeek: 5, start: "08:00", end: "14:00" },
        ],
    },
];

const patientNames: Array<{
    name: string;
    age: number;
    gender: "male" | "female" | "other";
    condition: string;
    phone: string;
    email: string;
}> = [
    { name: "John Davis", age: 48, gender: "male", condition: "Hypertension", phone: "+1 (555) 101-2001", email: "john.davis@example.com" },
    { name: "Emma Watson", age: 34, gender: "female", condition: "Migraine", phone: "+1 (555) 101-2002", email: "emma.watson@example.com" },
    { name: "Liam Miller", age: 8, gender: "male", condition: "Asthma", phone: "+1 (555) 101-2003", email: "liam.miller@example.com" },
    { name: "Olivia Brown", age: 62, gender: "female", condition: "Osteoarthritis", phone: "+1 (555) 101-2004", email: "olivia.brown@example.com" },
    { name: "Noah Wilson", age: 53, gender: "male", condition: "Arrhythmia", phone: "+1 (555) 101-2005", email: "noah.wilson@example.com" },
    { name: "Sophia Taylor", age: 29, gender: "female", condition: "Epilepsy", phone: "+1 (555) 101-2006", email: "sophia.taylor@example.com" },
    { name: "Lucas Anderson", age: 11, gender: "male", condition: "Allergic Rhinitis", phone: "+1 (555) 101-2007", email: "lucas.anderson@example.com" },
    { name: "Ava Martinez", age: 41, gender: "female", condition: "Rotator Cuff Tear", phone: "+1 (555) 101-2008", email: "ava.martinez@example.com" },
];

export async function runDemoSeed() {
    if (env.NODE_ENV === "production") {
        console.error("FATAL: Seed execution refused. NODE_ENV is set to production.");
        process.exit(1);
    }

    console.log("Starting demo data seeding...");
    await connectDatabase();

    try {
        if (env.ALLOW_SEED_RESET) {
            console.log("ALLOW_SEED_RESET=true: Purging prior synthetic collections...");
            await Promise.all([
                Doctor.deleteMany({}),
                Patient.deleteMany({}),
                Appointment.deleteMany({}),
                Visit.deleteMany({}),
            ]);
            console.log("Collections cleared.");
        }

        // 1. Seed or retrieve demo doctors
        const createdDoctors: any[] = [];
        for (const docData of demoDoctors) {
            let doc = await Doctor.findOne({ email: docData.email, isDeleted: false });
            if (!doc) {
                doc = await Doctor.create({ ...docData, isDeleted: false });
                console.log(`Created doctor: ${doc.name} (${doc.specialization})`);
            }
            createdDoctors.push(doc);
        }

        // 2. Seed default system users
        const defaultPassword = "Password123!";
        const passwordHash = await hashPassword(defaultPassword);

        const usersToSeed: Array<{
            name: string;
            email: string;
            role: Role;
            doctorId?: mongoose.Types.ObjectId;
        }> = [
            { name: "Clinic Admin", email: "admin@clinic.com", role: "admin" },
            { name: "Frontdesk Staff", email: "staff@clinic.com", role: "staff" },
            { name: createdDoctors[0].name, email: "doctor@clinic.com", role: "doctor", doctorId: createdDoctors[0]._id },
            { name: "Demo Viewer", email: "viewer@clinic.com", role: "viewer" },
        ];

        for (const u of usersToSeed) {
            const existing = await User.findOne({ email: u.email });
            if (!existing) {
                await User.create({
                    name: u.name,
                    email: u.email,
                    passwordHash,
                    role: u.role,
                    doctorId: u.doctorId,
                    isActive: true,
                    tokenVersion: 0,
                });
                console.log(`Created ${u.role} user: ${u.email}`);
            }
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

        // 4. Seed appointments spread over past 30 days and next 14 days
        const now = DateTime.utc();
        let appointmentCount = 0;
        let visitCount = 0;

        for (let i = 0; i < createdPatients.length; i++) {
            const patient = createdPatients[i];
            const doctor = createdDoctors[i % createdDoctors.length];

            // Past completed appointment (10-20 days ago)
            const pastDays = 5 + (i * 3);
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
                });
                appointmentCount++;

                // If completed, create a clinical visit for it
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
                                weightKg: 70 + (i * 2),
                            },
                            prescriptions: [
                                { medication: "Daily Multivitamin", dosage: "1 tablet daily", duration: "30 days" },
                            ],
                        });
                        visitCount++;
                    }
                }
            }

            // Future scheduled appointment (1-10 days ahead)
            const futureDays = 1 + (i * 2);
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
                });
                appointmentCount++;
            }
        }

        console.log("\n==========================================");
        console.log("Demo Seeding Completed Successfully!");
        console.log(`Doctors:      ${createdDoctors.length}`);
        console.log(`Patients:     ${createdPatients.length}`);
        console.log(`Appointments: ${appointmentCount} new entries`);
        console.log(`Visits:       ${visitCount} new clinical notes`);
        console.log("Default User: admin@clinic.com / Password123!");
        console.log("==========================================\n");
    } finally {
        await mongoose.disconnect();
    }
}

// Execute directly if run as CLI
if (process.argv[1]?.endsWith("seed-demo.ts")) {
    runDemoSeed().catch((err) => {
        console.error("Demo seed failed:", err);
        process.exit(1);
    });
}
