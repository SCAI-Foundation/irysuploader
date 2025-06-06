const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// === CLI Argument Parser ===
const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? parseInt(found.slice(prefix.length), 10) : undefined;
};
const startPage = getArg("start-page");
const endPage = getArg("end-page");
const batchSize = getArg("batch-size") || 10;

if (!startPage || !endPage || isNaN(startPage) || isNaN(endPage)) {
  console.error("❌ Usage: node 0_run_workflow.js --start-page=10 --end-page=100 --batch-size=10");
  process.exit(1);
}

function deletePdfFolder(page) {
  const dirPath = path.join("pdf", `page_${page}`);
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith(".pdf")) {
        fs.unlinkSync(path.join(dirPath, file));
      }
    }
    console.log(`🧹 Deleted PDF files in folder: ${dirPath}`);
  }
}

async function runWorkflowBatch(batchStart, batchEnd) {
  console.log(`\n🚀 Starting workflow for pages ${batchStart} - ${batchEnd}\n`);
  const steps = [
    {
      name: "📥 Step 1️⃣: Fetching DOI JSON...",
      command: `node 1_fetch_all_dois.js --start-page=${batchStart} --end-page=${batchEnd}`,
    },
    {
      name: "📄 Step 2️⃣: Downloading PDFs...",
      command: `node 2_fetch_all_pdfs.js --start-page=${batchStart} --end-page=${batchEnd}`,
    },
    {
      name: "🧠 Step 3️⃣: Generating metadata...",
      command: `node 3_generate_basic_metadata.js --start-page=${batchStart} --end-page=${batchEnd}`,
    },
    {
      name: "🆙 Step 4️⃣: Uploading metadata to Irys...",
      command: `node 4_upload_all_basic_metadata.js --start-page=${batchStart} --end-page=${batchEnd}`,
    },
    {
      name: "📤 Step 5️⃣: Uploading PDFs to Irys...",
      command: `node 5_upload_all_pdfs.js --start-page=${batchStart} --end-page=${batchEnd}`,
    },
  ];

  for (const step of steps) {
    console.log(`\n${step.name}`);
    try {
      execSync(step.command, { stdio: "inherit" });
    } catch (err) {
      console.error(`❌ Step failed: ${err.message}`);
      return false;
    }
  }

  // cleanup pdf files in each page folder
  for (let page = batchStart; page <= batchEnd; page++) {
    deletePdfFolder(page);
  }

  return true;
}

(async () => {
  for (let i = startPage; i <= endPage; i += batchSize) {
    const batchStart = i;
    const batchEnd = Math.min(endPage, i + batchSize - 1);
    const success = await runWorkflowBatch(batchStart, batchEnd);
    if (!success) {
      console.error(`❌ Stopping workflow due to error in batch ${batchStart}-${batchEnd}`);
      process.exit(1);
    }
  }

  console.log("\n✅ All batches completed successfully!");
})();
