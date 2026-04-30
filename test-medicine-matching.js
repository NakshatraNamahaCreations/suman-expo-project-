// Test medicine matching logic
require("dotenv").config();

const mongoose = require("mongoose");
const Medicine = require("./models/Medicine");

const { parsePrescriptionText } = require("./utils/imageOCR");

async function runTest() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Get all active medicines
    const medicines = await Medicine.find({ status: "Active" });
    console.log(`📚 Total Active Medicines in Database: ${medicines.length}`);
    console.log("\n📋 First 20 Medicines:");
    medicines.slice(0, 20).forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.name} (Price: ${m.sellingPrice || m.price}, Stock: ${m.stock})`);
    });

    // Test the matching logic with sample medicine names
    console.log("\n\n🔍 Testing Medicine Matching Logic:\n");

    const testMedicines = [
      "Paracetamol",
      "Paracetamol 650",
      "paracetamol 650mg",
      "Dolo 650",
      "Aspirin",
      "Crocin",
      "Amoxicillin",
      "Amoxicillin 500",
      "Metformin",
      "Ibuprofen",
      "Unknown Medicine XYZ"
    ];

    // Replicate the findDBMatch logic
    const findDBMatch = (medName) => {
      const search = medName.toLowerCase().replace(/\s+/g, "");
      if (search.length < 3) {
        console.log(`   ⚠️  Medicine name too short: "${medName}"`);
        return null;
      }

      const matches = medicines.filter((dbMed) => {
        const dbBase = dbMed.name.toLowerCase().replace(/\s*\d+\s*mg|\s*\d+\s*ml/g, "").replace(/\s+/g, "");
        return dbBase.includes(search) || search.includes(dbBase);
      });

      if (matches.length === 0) {
        console.log(`   ❌ No match for: "${medName}" (search="${search}")`);
        return null;
      }

      console.log(`   ✅ Found ${matches.length} match(es) for: "${medName}"`);
      matches.forEach(m => {
        console.log(`      → ${m.name} (ID: ${m._id})`);
      });
      return matches[0];
    };

    for (const medName of testMedicines) {
      findDBMatch(medName);
    }

    // Test parsing sample OCR text
    console.log("\n\n📖 Testing Text Parsing with Sample OCR Output:\n");

    const sampleOCRText = `
      Dr. Smith Clinic
      Prescription

      Patient: John Doe

      1. Tab Paracetamol 650mg - 1-0-1 for 5 days
      2. Tab Dolo 650 - 1-0-1 for 3 days
      3. Aspirin 500mg - 1-0-0 - 7 days
      4. Amoxicillin 500 - 1-1-1 for 5 days
      5. Metformin 500mg - 1-0-1 - 30 days

      Date: 2025-04-30
    `;

    console.log("Sample OCR Text:");
    console.log(sampleOCRText);
    console.log("\n📖 Parsing this text...\n");

    const parsed = parsePrescriptionText(sampleOCRText.toLowerCase());

    console.log(`\n📊 Parse Results: ${parsed.medicines.length} medicines found`);
    console.log(`Doctor: ${parsed.doctor || "Not found"}\n`);

    if (parsed.medicines.length > 0) {
      console.log("Parsed medicines:");
      parsed.medicines.forEach((m, i) => {
        console.log(`   ${i + 1}. "${m.name}" ${m.dosage || ""} - ${m.freqLabel} - ${m.duration}d - qty:${m.qty}`);

        // Try to match each one
        const dbMatch = findDBMatch(m.name);
        if (dbMatch) {
          console.log(`      → Matches DB: ${dbMatch.name} (ID: ${dbMatch._id})`);
        } else {
          console.log(`      → NO DB MATCH`);
        }
        console.log();
      });
    }

    await mongoose.disconnect();
    console.log("\n✅ Test complete!");

  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

runTest();
