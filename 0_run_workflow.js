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

if (!startPage || !endPage || isNaN(startPage) || isNaN(endPage) || startPage > endPage) {
  console.error("❌ Missing or invalid arguments. Usage: node 0_run_workflow.js --start-page=3 --end-page=4");
  process.exit(1);
}

console.log(`🚀 Starting workflow from page ${startPage} to ${endPage}\n`);

const steps = [
  {
    name: "📥 Step 1️⃣: Fetching DOI JSON for page {page}...",
    command: (page) => `node 1_fetch_all_dois.js --page=${page}`,
  },
  {
    name: "📄 Step 2️⃣: Downloading PDFs for page {page}...",
    command: (page) => `node 2_fetch_all_pdfs.js --page=${page}`,
  },
  {
    name: "🧠 Step 3️⃣: Generating metadata for page {page}...",
    command: (page) => `node 3_generate_basic_metadata.js --page=${page}`,
  },
  {
    name: "🆙 Step 4️⃣: Uploading metadata to Irys for page {page}...",
    command: (page) => `node 4_upload_all_basic_metadata.js --page=${page}`,
  },
  {
    name: "📤 Step 5️⃣: Uploading PDFs to Irys for page {page}...",
    command: (page) => `node 5_upload_all_pdfs.js --page=${page}`,
  },
];

(async () => {
  for (let page = startPage; page <= endPage; page++) {
    console.log(`\n🔄 Processing page ${page} of ${endPage}`);
    for (const step of steps) {
      const stepName = step.name.replace("{page}", page);
      console.log(`\n${stepName}`);
      try {
        execSync(step.command(page), { stdio: "inherit" });
      } catch (err) {
        console.error(`❌ Workflow failed on page ${page}: ${err.message}`);
        process.exit(1);
      }
    }
    console.log(`✅ Page ${page} completed successfully!`);
  }

  console.log("\n🎉 All pages processed successfully!");
})();