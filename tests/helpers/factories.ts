import mongoose from "mongoose";
import { hashPassword } from "../../src/utils/password.js";
import { User, type Role } from "../../src/modules/users/user.model.js";
import { Doctor, type IDoctor } from "../../src/modules/doctors/doctor.model.js";
import { Patient, type IPatient } from "../../src/modules/patients/patient.model.js";
import { Appointment, type IAppointment } from "../../src/modules/appointments/appointment.model.js";
import { Visit, type IVisit } from "../../src/modules/visits/visit.model.js";

let seq = 1;

export async function createTestDoctor(
    overrides: Partial<IDoctor> = {}
) {
    const s = seq++;
    return await Doctor.create({
        name: `Dr. Factory ${s}`,
        specialization: "General Practice",
        hospital: "City Hospital",
        email: `dr.${s}.${Date.now()}@test.com`,
        phone: `+12345678${s.toString().padStart(3, "0")}`,
        isDeleted: false,
        ...overrides,
    });
}

export async function createTestUser(
    overrides: {
        name?: string;
        email?: string;
        password?: string;
        role?: Role;
        doctorId?: mongoose.Types.ObjectId | string;
        isActive?: boolean;
        tokenVersion?: number;
    } = {}
) {
    const s = seq++;
    const password = overrides.password || "Password123!";
    const passwordHash = await hashPassword(password);

    const user = await User.create({
        name: overrides.name || `User ${s}`,
        email: overrides.email || `user.${s}.${Date.now()}@test.com`,
        passwordHash,
        role: overrides.role || "staff",
        doctorId: overrides.doctorId
            ? new mongoose.Types.ObjectId(overrides.doctorId)
            : undefined,
        isActive: overrides.isActive !== undefined ? overrides.isActive : true,
        tokenVersion: overrides.tokenVersion !== undefined ? overrides.tokenVersion : 0,
    });

    return { user, plainPassword: password };
}

export async function createTestPatient(
    doctorId: mongoose.Types.ObjectId | string,
    overrides: Partial<IPatient> = {}
) {
    const s = seq++;
    return await Patient.create({
        name: `Patient ${s}`,
        age: 30,
        gender: "male",
        phone: `+19876543${s.toString().padStart(3, "0")}`,
        email: `patient.${s}.${Date.now()}@test.com`,
        condition: "Checkup",
        doctorId: new mongoose.Types.ObjectId(doctorId),
        ...overrides,
    });
}

export async function createTestAppointment(
    doctorId: mongoose.Types.ObjectId | string,
    patientId: mongoose.Types.ObjectId | string,
    userId: mongoose.Types.ObjectId | string,
    overrides: Partial<IAppointment> = {}
) {
    const s = seq++;
    const startsAt =
        overrides.startsAt || new Date(Date.now() + 60 * 60 * 1000);
    const endsAt =
        overrides.endsAt || new Date(startsAt.getTime() + 30 * 60 * 1000);

    return await Appointment.create({
        doctorId: new mongoose.Types.ObjectId(doctorId),
        patientId: new mongoose.Types.ObjectId(patientId),
        startsAt,
        endsAt,
        status: "scheduled",
        reason: `Routine Checkup ${s}`,
        createdBy: new mongoose.Types.ObjectId(userId),
        ...overrides,
    });
}

export async function createTestVisit(
    doctorId: mongoose.Types.ObjectId | string,
    patientId: mongoose.Types.ObjectId | string,
    userId: mongoose.Types.ObjectId | string,
    overrides: Partial<IVisit> = {}
) {
    const s = seq++;
    return await Visit.create({
        doctorId: new mongoose.Types.ObjectId(doctorId),
        patientId: new mongoose.Types.ObjectId(patientId),
        chiefComplaint: `Chief complaint ${s}`,
        diagnosis: `Diagnosis ${s}`,
        notes: `Clinical notes ${s}`,
        visitDate: new Date(),
        createdBy: new mongoose.Types.ObjectId(userId),
        ...overrides,
    });
}
