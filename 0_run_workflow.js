// 0_run_workflow.js
const { execSync } = require("child_process");

// Get CLI arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? parseInt(found.slice(prefix.length), 10) : undefined;
};

const startPage = getArg("start-page");
const endPage = getArg("end-page");

if (!startPage || !endPage || isNaN(startPage) || isNaN(endPage)) {
  console.error("❌ Missing or invalid arguments. Usage: node 0_run_workflow.js --start-page=3 --end-page=4");
  process.exit(1);
}

console.log(`🚀 Starting workflow from page ${startPage} to ${endPage}\n`);

const steps = [
  {
    name: "📥 Step 1️⃣: Fetching DOI JSON...",
    command: `node 1_fetch_all_dois.js --start-page=${startPage} --end-page=${endPage}`,
  },
  {
    name: "📄 Step 2️⃣: Downloading PDFs...",
    command: `node 2_fetch_all_pdfs.js --start-page=${startPage} --end-page=${endPage}`,
  },
  {
    name: "🧠 Step 3️⃣: Generating metadata...",
    command: `node 3_generate_basic_metadata.js --start-page=${startPage} --end-page=${endPage}`,
  },
  {
    name: "🆙 Step 4️⃣: Uploading metadata to Irys...",
    command: `node 4_upload_all_basic_metadata.js --start-page=${startPage} --end-page=${endPage}`,
  },
  {
    name: "📤 Step 5️⃣: Uploading PDFs to Irys...",
    command: `node 5_upload_all_pdfs.js --start-page=${startPage} --end-page=${endPage}`,
  },
];

(async () => {
  for (const step of steps) {
    console.log(`\n${step.name}`);
    try {
      execSync(step.command, { stdio: "inherit" });
    } catch (err) {
      console.error(`❌ Workflow failed: ${err.message}`);
      process.exit(1);
    }
  }

  console.log("\n✅ All steps completed successfully!");
})();
