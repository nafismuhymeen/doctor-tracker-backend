import mongoose, { Schema, type PipelineStage } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { performance } from "node:perf_hooks";

// Standalone benchmark schema & model to run in complete isolation
const benchmarkPatientSchema = new Schema(
    {
        name: { type: String, required: true },
        age: { type: Number, required: true },
        gender: { type: String, required: true },
        phone: { type: String, required: true },
        condition: { type: String, required: true },
        doctorId: { type: Schema.Types.ObjectId, required: true, index: true },
        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Compound indexes for optimal aggregation performance
benchmarkPatientSchema.index({ isDeleted: 1, createdAt: 1 });
benchmarkPatientSchema.index({ isDeleted: 1, condition: 1 });
benchmarkPatientSchema.index({ doctorId: 1, isDeleted: 1 });

const benchmarkDoctorSchema = new Schema(
    {
        name: { type: String, required: true },
        specialization: { type: String, required: true },
        hospital: { type: String, required: true },
        isDeleted: { type: Boolean, default: false, index: true },
    },
    { timestamps: true }
);

async function runBenchmark() {
    console.log("==================================================");
    console.log("   DASHBOARD 50K PATIENT BENCHMARK (Phase 5.5)   ");
    console.log("==================================================");

    console.log("\nStarting dedicated in-memory MongoDB replica/instance...");
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    const conn = await mongoose.createConnection(uri).asPromise();
    const BenchPatient = conn.model("Patient", benchmarkPatientSchema);
    const BenchDoctor = conn.model("Doctor", benchmarkDoctorSchema);

    await BenchPatient.syncIndexes();
    await BenchDoctor.syncIndexes();

    console.log("Database initialized. Seeding 10 doctors...");
    const doctorDocs = [];
    for (let i = 1; i <= 10; i++) {
        doctorDocs.push({
            name: `Dr. Specialist ${i}`,
            specialization: ["Cardiology", "Neurology", "Pediatrics", "Orthopedics", "Dermatology"][i % 5],
            hospital: `Hospital Center ${i % 3}`,
            isDeleted: false,
        });
    }
    const createdDoctors = await BenchDoctor.insertMany(doctorDocs);
    const doctorIds = createdDoctors.map((d) => d._id);

    console.log("Seeding 50,000 synthetic patient records (in batches of 5,000)...");
    const TOTAL_PATIENTS = 50000;
    const BATCH_SIZE = 5000;
    const conditions = ["Hypertension", "Diabetes Type 2", "Asthma", "Migraine", "Arthritis", "Coronary Artery Disease"];
    const genders = ["male", "female", "other"];

    const seedStart = performance.now();
    for (let batch = 0; batch < TOTAL_PATIENTS / BATCH_SIZE; batch++) {
        const batchRecords = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
            const idx = batch * BATCH_SIZE + i;
            batchRecords.push({
                name: `Synthetic Patient ${idx}`,
                age: 18 + (idx % 70),
                gender: genders[idx % genders.length],
                phone: `+1555${String(idx).padStart(7, "0")}`,
                condition: conditions[idx % conditions.length],
                doctorId: doctorIds[idx % doctorIds.length],
                isDeleted: idx % 100 === 0, // 1% soft-deleted
                createdAt: new Date(Date.now() - (idx % 30) * 24 * 60 * 60 * 1000),
            });
        }
        await BenchPatient.insertMany(batchRecords);
        process.stdout.write(`  Inserted ${(batch + 1) * BATCH_SIZE} / ${TOTAL_PATIENTS} patients...\r`);
    }
    const seedDuration = ((performance.now() - seedStart) / 1000).toFixed(2);
    console.log(`\nSeeded 50,000 patients in ${seedDuration}s.`);

    // Aggregation pipeline from dashboard.service.ts
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    const pipeline: PipelineStage[] = [
        {
            $match: {
                isDeleted: false,
                createdAt: { $gte: startDate, $lte: endDate },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$createdAt",
                    },
                },
                count: { $sum: 1 },
            },
        },
        { $sort: { _id: 1 as const } },
    ];

    // Warm-up run
    await BenchPatient.aggregate(pipeline);

    // Timed runs
    console.log("\nExecuting 5 timed benchmark iterations of dashboard aggregation...");
    const timings: number[] = [];
    for (let i = 1; i <= 5; i++) {
        const start = performance.now();
        await BenchPatient.aggregate(pipeline);
        const duration = performance.now() - start;
        timings.push(duration);
        console.log(`  Iteration ${i}: ${duration.toFixed(2)} ms`);
    }

    const avgDuration = timings.reduce((a, b) => a + b, 0) / timings.length;
    const minDuration = Math.min(...timings);
    const maxDuration = Math.max(...timings);

    // Explain query execution
    console.log("\nAnalyzing query executionStats via .explain()...");
    const explainResult: any = await BenchPatient.aggregate(pipeline).explain("executionStats");

    const execStats = explainResult?.stages
        ? explainResult.stages[0]?.["$cursor"]?.executionStats
        : explainResult?.executionStats;

    const totalDocsExamined = execStats?.totalDocsExamined ?? "N/A";
    const nReturned = execStats?.nReturned ?? "N/A";
    const executionTimeMillis = execStats?.executionTimeMillis ?? avgDuration.toFixed(2);

    console.log("\n==================================================");
    console.log("            BENCHMARK RESULTS SUMMARY             ");
    console.log("==================================================");
    console.log(`Total Patients Seeded:   50,000`);
    console.log(`Average Execution Time:  ${avgDuration.toFixed(2)} ms`);
    console.log(`Min Execution Time:      ${minDuration.toFixed(2)} ms`);
    console.log(`Max Execution Time:      ${maxDuration.toFixed(2)} ms`);
    console.log(`Documents Examined:      ${totalDocsExamined}`);
    console.log(`Documents Returned:      ${nReturned}`);
    console.log(`Server Execution Time:   ${executionTimeMillis} ms`);
    console.log("==================================================\n");

    await conn.close();
    await mongoServer.stop();
}

runBenchmark().catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
});
