const fs = require('fs');
const axios = require('axios');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'doi');
const BASE_URL = 'https://api.scai.sh/dois?page=';
const TOTAL_PAGES = 883431;
const DELAY_MS = 2000;

// Parse CLI arguments: --start-page=XX --end-page=XX
const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find(arg => arg.startsWith(prefix));
  return found ? parseInt(found.slice(prefix.length), 10) : undefined;
};

const cliStartPage = getArg('start-page');
const cliEndPage = getArg('end-page');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

// Utility: Delay between requests
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get last downloaded page number from existing files
function getLastDownloadedPage() {
  const files = fs.readdirSync(OUTPUT_DIR);
  const pageNumbers = files
    .map(file => {
      const match = file.match(/page_(\d+)\.json$/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter(n => n !== null)
    .sort((a, b) => a - b);
  return pageNumbers.length ? pageNumbers[pageNumbers.length - 1] : 0;
}

// Download a range of pages
async function downloadAllPages(startPage, endPage) {
  for (let page = startPage; page <= endPage; page++) {
    const filePath = path.join(OUTPUT_DIR, `page_${page}.json`);
    if (fs.existsSync(filePath)) {
      console.log(`✅ Page ${page} already exists. Skipping.`);
      continue;
    }

    const url = `${BASE_URL}${page}`;
    try {
      console.log(`🔍 Fetching page ${page}...`);
      const res = await axios.get(url);
      const data = res.data;

      if (data && Array.isArray(data.dois)) {
        fs.writeFileSync(filePath, JSON.stringify(data.dois, null, 2));
        console.log(`✅ Page ${page} saved (${data.dois.length} DOIs)`);
      } else {
        console.warn(`⚠️ Page ${page} response missing 'dois' array. Skipping.`);
      }
    } catch (err) {
      console.error(`❌ Failed to fetch page ${page}: ${err.message}`);
      console.log('🛑 Stopping script. You can rerun it to resume.');
      break;
    }

    await sleep(DELAY_MS);
  }

  console.log('🎉 Finished fetching pages.');
}

// Entry point
async function main() {
  if (cliStartPage !== undefined && cliEndPage !== undefined) {
    console.log(`🚀 Running in range mode: page ${cliStartPage} → ${cliEndPage}`);
    await downloadAllPages(cliStartPage, cliEndPage);
  } else {
    const start = getLastDownloadedPage() + 1;
    const end = TOTAL_PAGES;
    console.log(`🔁 Resuming from page ${start} → ${end}`);
    await downloadAllPages(start, end);
  }
}

main();
