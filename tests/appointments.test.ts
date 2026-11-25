import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
    createTestAppointment,
    createTestDoctor,
    createTestPatient,
    createTestUser,
} from "./helpers/factories.js";
import { loginAs } from "./helpers/auth.js";
import { Appointment } from "../src/modules/appointments/appointment.model.js";

describe("Appointments Domain (Phase 2)", () => {
    describe("Doctor Availability (GET /api/v1/doctors/:id/availability)", () => {
        it("generates slots aligned to slotMinutes in doctor's timezone", async () => {
            const doctor = await createTestDoctor({
                timezone: "Asia/Dhaka",
                slotMinutes: 30,
            });

            const { agent } = await loginAs("staff");

            // Pick next Sunday (which is guaranteed to have default working hours 09:00-17:00)
            let nextSunday = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (nextSunday.weekday % 7 !== 0) {
                nextSunday = nextSunday.plus({ days: 1 });
            }
            const dateStr = nextSunday.toFormat("yyyy-MM-dd");

            const res = await agent.get(
                `/api/v1/doctors/${doctor.id}/availability?date=${dateStr}&days=1`
            );

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.doctorId).toBe(doctor.id);
            expect(res.body.data.slotMinutes).toBe(30);
            expect(res.body.data.days).toHaveLength(1);

            const dayObj = res.body.data.days[0];
            expect(dayObj.date).toBe(dateStr);
            // 09:00 to 17:00 at 30 min intervals = 8 hours * 2 = 16 slots
            expect(dayObj.slots.length).toBe(16);
            expect(dayObj.slots[0].available).toBe(true);
        });

        it("marks booked slots as available: false", async () => {
            const doctor = await createTestDoctor({
                timezone: "Asia/Dhaka",
                slotMinutes: 30,
            });
            const patient = await createTestPatient(doctor.id);
            const { user: staffUser } = await createTestUser({ role: "staff" });

            let nextSunday = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (nextSunday.weekday % 7 !== 0) {
                nextSunday = nextSunday.plus({ days: 1 });
            }
            const dateStr = nextSunday.toFormat("yyyy-MM-dd");

            // Create appointment at 09:00 Asia/Dhaka on nextSunday
            const bookedSlotStart = nextSunday
                .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();

            await createTestAppointment(doctor.id, patient.id, staffUser.id, {
                startsAt: bookedSlotStart,
                endsAt: new Date(bookedSlotStart.getTime() + 30 * 60 * 1000),
                status: "scheduled",
            });

            const { agent } = await loginAs("staff");
            const res = await agent.get(
                `/api/v1/doctors/${doctor.id}/availability?date=${dateStr}&days=1`
            );

            expect(res.status).toBe(200);
            const firstSlot = res.body.data.days[0].slots[0];
            expect(firstSlot.available).toBe(false);
            expect(res.body.data.days[0].slots[1].available).toBe(true);
        });
    });

    describe("Appointment Creation (POST /api/v1/appointments)", () => {
        it("creates appointment successfully for a valid doctor slot", async () => {
            const doctor = await createTestDoctor({
                timezone: "Asia/Dhaka",
                slotMinutes: 30,
            });
            const patient = await createTestPatient(doctor.id);
            const { agent } = await loginAs("staff");

            let targetDay = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (targetDay.weekday % 7 !== 0) {
                targetDay = targetDay.plus({ days: 1 });
            }
            const slotStart = targetDay
                .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();

            const res = await agent.post("/api/v1/appointments").send({
                doctorId: doctor.id,
                patientId: patient.id,
                startsAt: slotStart.toISOString(),
                reason: "Regular physical exam",
            });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.appointment.doctorId).toBe(doctor.id);
            expect(res.body.data.appointment.patientId).toBe(patient.id);
            expect(res.body.data.appointment.status).toBe("scheduled");

            // endsAt must be exactly startsAt + slotMinutes (30 mins)
            const createdEnds = new Date(res.body.data.appointment.endsAt).getTime();
            const createdStarts = new Date(res.body.data.appointment.startsAt).getTime();
            expect(createdEnds - createdStarts).toBe(30 * 60 * 1000);
        });

        it("rejects slot outside working hours with 400 OUTSIDE_WORKING_HOURS", async () => {
            const doctor = await createTestDoctor({
                timezone: "Asia/Dhaka",
                slotMinutes: 30,
            });
            const patient = await createTestPatient(doctor.id);
            const { agent } = await loginAs("staff");

            let targetDay = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (targetDay.weekday % 7 !== 0) {
                targetDay = targetDay.plus({ days: 1 });
            }
            // 22:00 is outside 09:00-17:00 working hours
            const invalidSlot = targetDay
                .set({ hour: 22, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();

            const res = await agent.post("/api/v1/appointments").send({
                doctorId: doctor.id,
                patientId: patient.id,
                startsAt: invalidSlot.toISOString(),
            });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("OUTSIDE_WORKING_HOURS");
        });

        it("rejects appointment when patient is not assigned to doctor", async () => {
            const doctorA = await createTestDoctor();
            const doctorB = await createTestDoctor();
            // Patient belongs to doctorA
            const patientA = await createTestPatient(doctorA.id);

            const { agent } = await loginAs("staff");

            let targetDay = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (targetDay.weekday % 7 !== 0) {
                targetDay = targetDay.plus({ days: 1 });
            }
            const slotStart = targetDay
                .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();

            // Attempt to book patientA under doctorB
            const res = await agent.post("/api/v1/appointments").send({
                doctorId: doctorB.id,
                patientId: patientA.id,
                startsAt: slotStart.toISOString(),
            });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain("not assigned");
        });

        it("rejects patient double-booking with 409 PATIENT_DOUBLE_BOOKED", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent } = await loginAs("staff");

            let targetDay = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (targetDay.weekday % 7 !== 0) {
                targetDay = targetDay.plus({ days: 1 });
            }
            const slotStart = targetDay
                .set({ hour: 11, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();

            // Book first appointment
            const res1 = await agent.post("/api/v1/appointments").send({
                doctorId: doctor.id,
                patientId: patient.id,
                startsAt: slotStart.toISOString(),
            });
            expect(res1.status).toBe(201);

            // Attempt second appointment for same patient overlapping same time
            const res2 = await agent.post("/api/v1/appointments").send({
                doctorId: doctor.id,
                patientId: patient.id,
                startsAt: slotStart.toISOString(),
            });

            expect(res2.status).toBe(409);
            expect(res2.body.code).toBe("PATIENT_DOUBLE_BOOKED");
        });

        it("concurrency race: parallel requests for identical slot yield exactly one 201 and one 409 SLOT_TAKEN", async () => {
            const doctor = await createTestDoctor();
            const patient1 = await createTestPatient(doctor.id);
            const patient2 = await createTestPatient(doctor.id);

            const { agent } = await loginAs("staff");

            let targetDay = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (targetDay.weekday % 7 !== 0) {
                targetDay = targetDay.plus({ days: 1 });
            }
            const slotStart = targetDay
                .set({ hour: 14, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();

            // Fire both requests concurrently
            const [resA, resB] = await Promise.all([
                agent.post("/api/v1/appointments").send({
                    doctorId: doctor.id,
                    patientId: patient1.id,
                    startsAt: slotStart.toISOString(),
                }),
                agent.post("/api/v1/appointments").send({
                    doctorId: doctor.id,
                    patientId: patient2.id,
                    startsAt: slotStart.toISOString(),
                }),
            ]);

            const statuses = [resA.status, resB.status].sort();
            expect(statuses).toEqual([201, 409]);

            const conflictRes = resA.status === 409 ? resA : resB;
            expect(conflictRes.body.code).toBe("SLOT_TAKEN");
        });
    });

    describe("Status Lifecycle (PATCH /api/v1/appointments/:id/status)", () => {
        it("allows valid transition from scheduled to cancelled", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent, user } = await loginAs("staff");

            const appt = await createTestAppointment(doctor.id, patient.id, user.id);

            const res = await agent
                .patch(`/api/v1/appointments/${appt.id}/status`)
                .send({
                    status: "cancelled",
                    cancelReason: "Patient requested cancellation",
                });

            expect(res.status).toBe(200);
            expect(res.body.data.appointment.status).toBe("cancelled");
            expect(res.body.data.appointment.cancelReason).toBe(
                "Patient requested cancellation"
            );
        });

        it("rejects transition from terminal status with 409 INVALID_STATUS_TRANSITION", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent, user } = await loginAs("staff");

            const appt = await createTestAppointment(doctor.id, patient.id, user.id, {
                status: "cancelled",
            });

            const res = await agent
                .patch(`/api/v1/appointments/${appt.id}/status`)
                .send({ status: "completed" });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("INVALID_STATUS_TRANSITION");
        });

        it("rejects completing an appointment before its start time", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent, user } = await loginAs("staff");

            // Appointment in future
            const appt = await createTestAppointment(doctor.id, patient.id, user.id, {
                startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                status: "scheduled",
            });

            const res = await agent
                .patch(`/api/v1/appointments/${appt.id}/status`)
                .send({ status: "completed" });

            expect(res.status).toBe(400);
        });
    });

    describe("Reschedule (PATCH /api/v1/appointments/:id/reschedule)", () => {
        it("reschedules appointment to a new available slot", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent, user } = await loginAs("staff");

            let targetDay = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (targetDay.weekday % 7 !== 0) {
                targetDay = targetDay.plus({ days: 1 });
            }
            const oldSlot = targetDay
                .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();
            const newSlot = targetDay
                .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();

            const appt = await createTestAppointment(doctor.id, patient.id, user.id, {
                startsAt: oldSlot,
            });

            const res = await agent
                .patch(`/api/v1/appointments/${appt.id}/reschedule`)
                .send({ startsAt: newSlot.toISOString() });

            expect(res.status).toBe(200);
            expect(new Date(res.body.data.appointment.startsAt).getTime()).toBe(
                newSlot.getTime()
            );
        });

        it("rejects rescheduling onto a taken slot with 409 SLOT_TAKEN", async () => {
            const doctor = await createTestDoctor();
            const patient1 = await createTestPatient(doctor.id);
            const patient2 = await createTestPatient(doctor.id);
            const { agent, user } = await loginAs("staff");

            let targetDay = DateTime.now().setZone("Asia/Dhaka").plus({ days: 1 });
            while (targetDay.weekday % 7 !== 0) {
                targetDay = targetDay.plus({ days: 1 });
            }
            const slotA = targetDay
                .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();
            const slotB = targetDay
                .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
                .toJSDate();

            // appt1 at slotA, appt2 at slotB
            const appt1 = await createTestAppointment(doctor.id, patient1.id, user.id, {
                startsAt: slotA,
            });
            await createTestAppointment(doctor.id, patient2.id, user.id, {
                startsAt: slotB,
            });

            // Attempt to reschedule appt1 onto slotB
            const res = await agent
                .patch(`/api/v1/appointments/${appt1.id}/reschedule`)
                .send({ startsAt: slotB.toISOString() });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("SLOT_TAKEN");
        });
    });

    describe("Cascade & Deletion Guards", () => {
        it("cancels future scheduled appointments when patient is soft-deleted", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent, user } = await loginAs("admin");

            const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const appt = await createTestAppointment(doctor.id, patient.id, user.id, {
                startsAt: futureDate,
                status: "scheduled",
            });

            // Delete patient
            const deleteRes = await agent.delete(`/api/v1/patients/${patient.id}`);
            expect(deleteRes.status).toBe(200);

            // Verify appointment was automatically cancelled
            const updatedAppt = await Appointment.findById(appt.id);
            expect(updatedAppt?.status).toBe("cancelled");
            expect(updatedAppt?.cancelReason).toBe("Patient removed");
        });

        it("refuses doctor deletion with 409 DOCTOR_HAS_APPOINTMENTS when future appointments exist", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent, user } = await loginAs("admin");

            const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await createTestAppointment(doctor.id, patient.id, user.id, {
                startsAt: futureDate,
                status: "scheduled",
            });

            // Attempt to delete doctor
            const res = await agent.delete(`/api/v1/doctors/${doctor.id}`);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe("DOCTOR_HAS_APPOINTMENTS");
        });
    });

    describe("Doctor Role Scoping on Appointments", () => {
        it("doctor can only access their own appointments, returns 404 for others", async () => {
            const docA = await createTestDoctor();
            const docB = await createTestDoctor();
            const patA = await createTestPatient(docA.id);
            const patB = await createTestPatient(docB.id);

            const { agent: agentA, user: userA } = await loginAs("doctor", { doctorId: docA.id });
            const { user: userB } = await createTestUser({ role: "doctor", doctorId: docB.id });

            const apptA = await createTestAppointment(docA.id, patA.id, userA.id);
            const apptB = await createTestAppointment(docB.id, patB.id, userB.id);

            // Read own appointment -> 200
            const ownRes = await agentA.get(`/api/v1/appointments/${apptA.id}`);
            expect(ownRes.status).toBe(200);

            // Read docB appointment -> 404
            const otherRes = await agentA.get(`/api/v1/appointments/${apptB.id}`);
            expect(otherRes.status).toBe(404);

            // List appointments -> contains apptA, excludes apptB
            const listRes = await agentA.get("/api/v1/appointments");
            expect(listRes.status).toBe(200);
            const ids = listRes.body.data.appointments.map((a: any) => a._id);
            expect(ids).toContain(apptA.id);
            expect(ids).not.toContain(apptB.id);
        });
    });

    describe("Appointments Dashboard (GET /api/v1/dashboard/appointments)", () => {
        it("returns aggregated counts for today, next 7 days, and top doctors for admin", async () => {
            const doctor = await createTestDoctor();
            const patient = await createTestPatient(doctor.id);
            const { agent, user } = await loginAs("admin");

            // Create today's appointment
            const todayStartsAt = DateTime.now().setZone("Asia/Dhaka").set({ hour: 12, minute: 0 }).toJSDate();
            await createTestAppointment(doctor.id, patient.id, user.id, {
                startsAt: todayStartsAt,
                status: "scheduled",
            });

            const res = await agent.get("/api/v1/dashboard/appointments?range=30d");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.today.scheduled).toBeGreaterThanOrEqual(1);
            expect(res.body.data.next7Days).toHaveLength(7);
            expect(res.body.data.topBusiestDoctors).toBeDefined();
        });

        it("omits topBusiestDoctors for doctor role and scopes metrics to own doctor", async () => {
            const doctor = await createTestDoctor();
            const { agent } = await loginAs("doctor", { doctorId: doctor.id });

            const res = await agent.get("/api/v1/dashboard/appointments");
            expect(res.status).toBe(200);
            expect(res.body.data.topBusiestDoctors).toBeUndefined();
        });
    });
});
