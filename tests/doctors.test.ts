import { describe, it, expect } from "vitest";
import { loginAs } from "./helpers/auth.js";
import { createTestDoctor } from "./helpers/factories.js";
import { Doctor } from "../src/modules/doctors/doctor.model.js";

describe("Doctor Working-Hours Alignment to slotMinutes (Roadmap 2.1)", () => {
    describe("POST /api/v1/doctors", () => {
        it("creates doctor successfully when workingHours align to slotMinutes", async () => {
            const { agent } = await loginAs("admin");

            const res = await agent.post("/api/v1/doctors").send({
                name: "Dr. Aligned Test",
                specialization: "Cardiology",
                hospital: "City Hospital",
                phone: "+15551234567",
                email: `aligned.${Date.now()}@clinic.com`,
                timezone: "Asia/Dhaka",
                slotMinutes: 30,
                workingHours: [
                    { dayOfWeek: 1, start: "09:00", end: "17:00" }, // 480 min (multiple of 30)
                ],
            });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.doctor.slotMinutes).toBe(30);
        });

        it("rejects doctor creation when workingHours do not align to slotMinutes", async () => {
            const { agent } = await loginAs("admin");

            const res = await agent.post("/api/v1/doctors").send({
                name: "Dr. Unaligned Test",
                specialization: "Cardiology",
                hospital: "City Hospital",
                phone: "+15551234568",
                email: `unaligned.${Date.now()}@clinic.com`,
                timezone: "Asia/Dhaka",
                slotMinutes: 45,
                workingHours: [
                    { dayOfWeek: 1, start: "09:00", end: "17:00" }, // 480 min (not multiple of 45)
                ],
            });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe("UNALIGNED_WORKING_HOURS");
            expect(res.body.message).toBe(
                "Working hours must align to the 45-minute slot length (09:00-17:00 is 480 minutes)"
            );
        });
    });

    describe("PATCH /api/v1/doctors/:id", () => {
        it("rejects slotMinutes-only change that breaks existing workingHours alignment", async () => {
            const { agent } = await loginAs("admin");

            const doctor = await createTestDoctor({
                slotMinutes: 30,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
            });

            const res = await agent.patch(`/api/v1/doctors/${doctor.id}`).send({
                slotMinutes: 45,
            });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe("UNALIGNED_WORKING_HOURS");
            expect(res.body.message).toBe(
                "Working hours must align to the 45-minute slot length (09:00-17:00 is 480 minutes)"
            );
        });

        it("rejects workingHours-only change that does not align with existing slotMinutes", async () => {
            const { agent } = await loginAs("admin");

            const doctor = await createTestDoctor({
                slotMinutes: 30,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
            });

            // 09:00 to 10:15 is 75 minutes (not divisible by 30)
            const res = await agent.patch(`/api/v1/doctors/${doctor.id}`).send({
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "10:15" }],
            });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe("UNALIGNED_WORKING_HOURS");
            expect(res.body.message).toBe(
                "Working hours must align to the 30-minute slot length (09:00-10:15 is 75 minutes)"
            );
        });

        it("accepts workingHours-only change when it aligns with existing slotMinutes", async () => {
            const { agent } = await loginAs("admin");

            const doctor = await createTestDoctor({
                slotMinutes: 30,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
            });

            // 09:00 to 10:30 is 90 minutes (divisible by 30)
            const res = await agent.patch(`/api/v1/doctors/${doctor.id}`).send({
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "10:30" }],
            });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.doctor.workingHours[0].end).toBe("10:30");
        });

        it("allows unrelated PATCH on a doctor with an old unaligned schedule", async () => {
            const { agent } = await loginAs("admin");

            // Seed doctor directly in MongoDB with an unaligned schedule (bypassing service validation)
            const doctor = await Doctor.create({
                name: "Dr. Legacy Unaligned",
                specialization: "Neurology",
                hospital: "Old Clinic",
                email: `legacy.${Date.now()}@clinic.com`,
                phone: "+15559876543",
                slotMinutes: 45,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }], // 480 min (unaligned with 45)
                isDeleted: false,
            });

            // Update only hospital name (neither workingHours nor slotMinutes touched)
            const res = await agent.patch(`/api/v1/doctors/${doctor.id}`).send({
                hospital: "Modern Medical Center",
            });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.doctor.hospital).toBe("Modern Medical Center");
        });
    });

    describe("Doctor role self-edit path", () => {
        it("enforces alignment when doctor self-edits schedule fields", async () => {
            const doctor = await createTestDoctor({
                slotMinutes: 30,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
            });

            const { agent } = await loginAs("doctor", {
                doctorId: doctor._id,
            });

            // Doctor attempts to change slotMinutes to 45 without updating workingHours
            const failRes = await agent.patch(`/api/v1/doctors/${doctor.id}`).send({
                slotMinutes: 45,
            });

            expect(failRes.status).toBe(400);
            expect(failRes.body.success).toBe(false);
            expect(failRes.body.code).toBe("UNALIGNED_WORKING_HOURS");
            expect(failRes.body.message).toBe(
                "Working hours must align to the 45-minute slot length (09:00-17:00 is 480 minutes)"
            );

            // Doctor changes slotMinutes to 45 with an aligned workingHours (09:00-12:00 is 180 min, 180 % 45 = 0)
            const successRes = await agent.patch(`/api/v1/doctors/${doctor.id}`).send({
                slotMinutes: 45,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
            });

            expect(successRes.status).toBe(200);
            expect(successRes.body.success).toBe(true);
            expect(successRes.body.data.doctor.slotMinutes).toBe(45);
        });
    });

    describe("checkDoctorSchedules audit script", () => {
        it("identifies doctors with unaligned schedules without modifying data", async () => {
            const { checkDoctorSchedules } = await import(
                "../src/scripts/check-doctor-schedules.js"
            );

            // Create one aligned doctor and one unaligned doctor
            const alignedDoc = await createTestDoctor({
                name: "Dr. Aligned Audit",
                slotMinutes: 30,
                workingHours: [{ dayOfWeek: 1, start: "09:00", end: "11:00" }], // 120 min
            });

            const unalignedDoc = await Doctor.create({
                name: "Dr. Unaligned Audit",
                specialization: "Dermatology",
                hospital: "Audit Hospital",
                email: `audit.unaligned.${Date.now()}@clinic.com`,
                phone: "+15550001111",
                slotMinutes: 45,
                workingHours: [{ dayOfWeek: 2, start: "09:00", end: "17:00" }], // 480 min (480 % 45 = 30)
                isDeleted: false,
            });

            const violations = await checkDoctorSchedules();
            const found = violations.find((v) => v.id === unalignedDoc.id);

            expect(found).toBeDefined();
            expect(found?.name).toBe("Dr. Unaligned Audit");
            expect(found?.slotMinutes).toBe(45);
            expect(found?.violations).toHaveLength(1);
            expect(found?.violations[0]).toEqual({
                dayOfWeek: 2,
                start: "09:00",
                end: "17:00",
                duration: 480,
                remainder: 30,
            });

            // The aligned doctor should not be reported
            expect(violations.some((v) => v.id === alignedDoc.id)).toBe(false);

            // Verify data was not modified
            const unalignedDocAfter = await Doctor.findById(unalignedDoc.id);
            expect(unalignedDocAfter?.slotMinutes).toBe(45);
            expect(unalignedDocAfter?.workingHours[0].end).toBe("17:00");
        });
    });
});

