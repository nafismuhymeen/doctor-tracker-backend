import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Doctor } from "../modules/doctors/doctor.model.js";
import { Patient } from "../modules/patients/patient.model.js";

const doctorsData = [
    {
        name: "Dr. Sarah Johnson",
        specialization: "Cardiology",
        hospital: "Mayo Clinic",
        phone: "+1 (555) 234-5678",
        email: "sarah.johnson@mayoclinic.org",
    },
    {
        name: "Dr. Marcus Chen",
        specialization: "Neurology",
        hospital: "Johns Hopkins Hospital",
        phone: "+1 (555) 345-6789",
        email: "marcus.chen@jhmi.edu",
    },
    {
        name: "Dr. Emily Rodriguez",
        specialization: "Pediatrics",
        hospital: "Boston Children's Hospital",
        phone: "+1 (555) 456-7890",
        email: "emily.rodriguez@childrens.harvard.edu",
    },
    {
        name: "Dr. James Wilson",
        specialization: "Orthopedics",
        hospital: "Cleveland Clinic",
        phone: "+1 (555) 567-8901",
        email: "james.wilson@ccf.org",
    },
    {
        name: "Dr. Priya Patel",
        specialization: "Dermatology",
        hospital: "Mount Sinai Hospital",
        phone: "+1 (555) 678-9012",
        email: "priya.patel@mountsinai.org",
    },
    {
        name: "Dr. Robert Kim",
        specialization: "Oncology",
        hospital: "Memorial Sloan Kettering",
        phone: "+1 (555) 789-0123",
        email: "robert.kim@mskcc.org",
    },
    {
        name: "Dr. Lisa Thompson",
        specialization: "Psychiatry",
        hospital: "Massachusetts General Hospital",
        phone: "+1 (555) 890-1234",
        email: "lisa.thompson@mgh.harvard.edu",
    },
    {
        name: "Dr. David Al-Mansoor",
        specialization: "Endocrinology",
        hospital: "Stanford Health Care",
        phone: "+1 (555) 901-2345",
        email: "david.mansoor@stanfordhealthcare.org",
    },
    {
        name: "Dr. Elena Rostova",
        specialization: "Gastroenterology",
        hospital: "Cedars-Sinai Medical Center",
        phone: "+1 (555) 012-3456",
        email: "elena.rostova@csmc.edu",
    },
    {
        name: "Dr. Michael O'Connor",
        specialization: "Pulmonology",
        hospital: "Northwestern Memorial Hospital",
        phone: "+1 (555) 123-4560",
        email: "michael.oconnor@nm.org",
    },
    {
        name: "Dr. Sophia Martinez",
        specialization: "Cardiology",
        hospital: "NewYork-Presbyterian Hospital",
        phone: "+1 (555) 234-5671",
        email: "sophia.martinez@nyp.org",
    },
    {
        name: "Dr. Alexander Wright",
        specialization: "Urology",
        hospital: "UCLA Medical Center",
        phone: "+1 (555) 345-6782",
        email: "alexander.wright@mednet.ucla.edu",
    },
    {
        name: "Dr. Grace Tanaka",
        specialization: "Ophthalmology",
        hospital: "Bascom Palmer Eye Institute",
        phone: "+1 (555) 456-7893",
        email: "grace.tanaka@miami.edu",
    },
    {
        name: "Dr. Benjamin Foster",
        specialization: "General Surgery",
        hospital: "Barnes-Jewish Hospital",
        phone: "+1 (555) 567-8904",
        email: "benjamin.foster@bjc.org",
    },
    {
        name: "Dr. Fatima Zahra",
        specialization: "Nephrology",
        hospital: "Vanderbilt University Medical Center",
        phone: "+1 (555) 678-9015",
        email: "fatima.zahra@vumc.org",
    },
    {
        name: "Dr. Christopher Lee",
        specialization: "Rheumatology",
        hospital: "Hospital for Special Surgery",
        phone: "+1 (555) 789-0126",
        email: "christopher.lee@hss.edu",
    },
    {
        name: "Dr. Hannah Schmidt",
        specialization: "Pediatrics",
        hospital: "Children's Hospital of Philadelphia",
        phone: "+1 (555) 890-1237",
        email: "hannah.schmidt@chop.edu",
    },
    {
        name: "Dr. Tariq Hassan",
        specialization: "Neurology",
        hospital: "UPMC Presbyterian Shadyside",
        phone: "+1 (555) 901-2348",
        email: "tariq.hassan@upmc.edu",
    },
    {
        name: "Dr. Chloe Dubois",
        specialization: "Dermatology",
        hospital: "Cleveland Clinic",
        phone: "+1 (555) 012-3459",
        email: "chloe.dubois@ccf.org",
    },
    {
        name: "Dr. Daniel Greenberg",
        specialization: "Cardiology",
        hospital: "Mount Sinai Hospital",
        phone: "+1 (555) 123-4569",
        email: "daniel.greenberg@mountsinai.org",
    },
];

const patientFirstNames = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
    "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
    "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
    "Kenneth", "Dorothy", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa",
    "Edward", "Deborah", "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Sharon",
    "Jeffrey", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
];

const patientLastNames = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
    "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
];

const conditionsBySpecialty: Record<string, string[]> = {
    Cardiology: ["Hypertension", "Coronary Artery Disease", "Arrhythmia", "Heart Failure"],
    Neurology: ["Migraine", "Epilepsy", "Parkinson's Disease", "Multiple Sclerosis"],
    Pediatrics: ["Asthma", "Allergic Rhinitis", "Viral Infection", "Ear Infection (Otitis)"],
    Orthopedics: ["Osteoarthritis", "Lumbar Spine Strain", "Knee Tendinitis", "Rotator Cuff Tear"],
    Dermatology: ["Eczema", "Psoriasis", "Acne Vulgaris", "Contact Dermatitis"],
    Oncology: ["Breast Carcinoma Follow-up", "Lymphoma Surveillance", "Prostate Neoplasm", "Anemia of Chronic Disease"],
    Psychiatry: ["Major Depressive Disorder", "Generalized Anxiety", "Insomnia", "Bipolar Disorder"],
    Endocrinology: ["Type 2 Diabetes", "Hypothyroidism", "Metabolic Syndrome", "Hashimoto Thyroiditis"],
    Gastroenterology: ["GERD", "Irritable Bowel Syndrome", "Ulcerative Colitis", "Gastritis"],
    Pulmonology: ["COPD", "Chronic Bronchitis", "Sleep Apnea", "Mild Persistent Asthma"],
    Urology: ["Kidney Stones", "Benign Prostatic Hyperplasia", "Urinary Tract Infection", "Hematuria Evaluation"],
    Ophthalmology: ["Glaucoma", "Cataract Evaluation", "Diabetic Retinopathy", "Dry Eye Syndrome"],
    "General Surgery": ["Post-Appendectomy Recovery", "Inguinal Hernia", "Cholelithiasis", "Post-Op Wound Care"],
    Nephrology: ["Chronic Kidney Disease Stage 3", "Proteinuria", "Diabetic Nephropathy", "Hypertensive Nephrosclerosis"],
    Rheumatology: ["Rheumatoid Arthritis", "Systemic Lupus", "Gout", "Ankylosing Spondylitis"],
};

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

const seedData = async () => {
    try {
        await connectDatabase();
        console.log("Connected to MongoDB for data seeding...");

        // Optional: clean existing doctors and patients for clean fresh state if desired
        // Or keep existing and just append. Let's see: clearing old non-admin data makes tests consistent.
        const existingDoctorsCount = await Doctor.countDocuments();
        if (existingDoctorsCount > 0) {
            console.log(`Found ${existingDoctorsCount} existing doctors. Clearing doctors and patients for a clean dataset...`);
            await Doctor.deleteMany({});
            await Patient.deleteMany({});
        }

        const now = new Date();
        const totalDoctorsToCreate = doctorsData.length; // 20 doctors (well within 15-25 range)
        let totalPatientsCreated = 0;

        console.log(`Seeding ${totalDoctorsToCreate} doctors with distributed createdAt dates...`);

        for (let i = 0; i < totalDoctorsToCreate; i++) {
            const docInfo = doctorsData[i];

            // Distribute doctor creation date between 35 days ago and 2 days ago
            const daysAgo = Math.round(35 - (i * 33) / (totalDoctorsToCreate - 1));
            const doctorCreatedAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
            doctorCreatedAt.setHours(randomInt(8, 17), randomInt(0, 59), randomInt(0, 59));

            // Create Doctor document preserving custom createdAt
            const [doctor] = await Doctor.insertMany(
                [
                    {
                        name: docInfo.name,
                        specialization: docInfo.specialization,
                        hospital: docInfo.hospital,
                        phone: docInfo.phone,
                        email: docInfo.email,
                        createdAt: doctorCreatedAt,
                        updatedAt: doctorCreatedAt,
                    },
                ]
            );

            // Determine number of patients for this doctor: 2 to 5 patients (§requirement: "add 2-5 patients for each of them")
            const patientCount = randomInt(2, 5);
            const specialtyConditions = conditionsBySpecialty[docInfo.specialization] || [
                "Routine Health Exam",
                "Mild Hypertension",
                "General Malaise",
            ];

            const patientsToInsert = [];

            for (let p = 0; p < patientCount; p++) {
                const firstName = randomItem(patientFirstNames);
                const lastName = randomItem(patientLastNames);
                const gender = (["male", "female", "other"] as const)[randomInt(0, 1)]; // mostly male/female
                const age = randomInt(18, 82);
                const condition = randomItem(specialtyConditions);
                const phone = `+1 (555) ${randomInt(100, 999)}-${randomInt(1000, 9999)}`;
                const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(10, 99)}@example.com`;

                // Patient createdAt between doctor's createdAt and now
                const doctorTime = doctorCreatedAt.getTime();
                const nowTime = now.getTime();
                const patientTime = randomInt(doctorTime, nowTime);
                const patientCreatedAt = new Date(patientTime);

                patientsToInsert.push({
                    name: `${firstName} ${lastName}`,
                    age,
                    gender,
                    phone,
                    email,
                    condition,
                    doctorId: doctor._id,
                    createdAt: patientCreatedAt,
                    updatedAt: patientCreatedAt,
                });
            }

            await Patient.insertMany(patientsToInsert);
            totalPatientsCreated += patientCount;
            console.log(
                `[${i + 1}/${totalDoctorsToCreate}] Created ${doctor.name} (${doctor.specialization}) with ${patientCount} patients (Created: ${doctorCreatedAt.toISOString().split("T")[0]})`
            );
        }

        console.log("\n==========================================");
        console.log(`Seeding completed successfully!`);
        console.log(`Total Doctors Created:  ${totalDoctorsToCreate}`);
        console.log(`Total Patients Created: ${totalPatientsCreated}`);
        console.log(`Avg Patients / Doctor:  ${(totalPatientsCreated / totalDoctorsToCreate).toFixed(1)}`);
        console.log("==========================================\n");
    } catch (error) {
        console.error("Data seeding failed:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed.");
    }
};

seedData();

