// 0_run_workflow.js
const { execSync } = require("child_process");

// Get CLI arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  if (!found) return undefined;
  const value = found.slice(prefix.length);
  return isNaN(parseInt(value, 10)) ? undefined : parseInt(value, 10);
};

const startPage = getArg("start-page");
const endPage = getArg("end-page");

// Debug: Log raw and parsed arguments
console.log(`📋 Raw arguments: ${args.join(", ")}`);
console.log(`📍 Parsed startPage: ${startPage}, endPage: ${endPage}`);

// Validate arguments
if (startPage === undefined || endPage === undefined || isNaN(startPage) || isNaN(endPage) || startPage > endPage || startPage < 1) {
  console.error("❌ Invalid arguments. Usage: node 0_run_workflow.js --start-page=3 --end-page=4");
  console.error("   Ensure --start-page and --end-page are positive numbers and start-page <= end-page.");
  process.exit(1);
}

console.log(`🚀 Starting workflow from page ${startPage} to ${endPage}\n`);

const steps = [
  {
    name: "📥 Step 1️⃣: Fetching DOI JSON for page {page}...",
    command: (start, end) => `node 1_fetch_all_dois.js --start-page=${start} --end-page=${end}`,
  },
  {
    name: "📄 Step 2️⃣: Downloading PDFs for page {page}...",
    command: (start, end) => `node 2_fetch_all_pdfs.js --start-page=${start} --end-page=${end}`,
  },
  {
    name: "🧠 Step 3️⃣: Generating metadata for page {page}...",
    command: (start, end) => `node 3_generate_basic_metadata.js --start-page=${start} --end-page=${end}`,
  },
  {
    name: "🆙 Step 4️⃣: Uploading metadata to Irys for page {page}...",
    command: (start, end) => `node 4_upload_all_basic_metadata.js --start-page=${start} --end-page=${end}`,
  },
  {
    name: "📤 Step 5️⃣: Uploading PDFs to Irys for page {page}...",
    command: (start, end) => `node 5_upload_all_pdfs.js --start-page=${start} --end-page=${end}`,
  },
];

// Function to process a single page
const processPage = async (page) => {
  console.log(`\n🔄 Starting page ${page} of ${endPage}`);
  for (const step of steps) {
    const stepName = step.name.replace("{page}", page);
    const command = step.command(page, page); // Pass page as both start and end
    console.log(`\n${stepName}`);
    console.log(`Executing: ${command}`);
    try {
      execSync(command, { stdio: "inherit" });
    } catch (err) {
      console.error(`❌ Workflow failed on page ${page}, step "${stepName}": ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`✅ Page ${page} completed successfully!`);
};

// Process pages one by one
(async () => {
  for (let page = startPage; page <= endPage; page++) {
    console.log(`\n📅 Moving to page ${page}`);
    await processPage(page); // Wait for each page to complete
  }
  console.log("\n🎉 All pages processed successfully!");
})();