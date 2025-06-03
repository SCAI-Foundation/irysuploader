const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

// === Configuration ===
const DOI_DIR = './doi';
const PDF_DIR = './pdf';
const SCI_HUB_MIRRORS = [
  'https://sci-hub.st/',
  'https://sci-hub.se/',
  'https://sci-hub.ru/',
  'https://www.tesble.com/',
];
const DELAY_MS = 3000;
const MIN_VALID_SIZE = 1024;

// === CLI Argument Parser ===
const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find(arg => arg.startsWith(prefix));
  return found ? parseInt(found.slice(prefix.length), 10) : undefined;
};
const cliStart = getArg("start-page");
const cliEnd = getArg("end-page");

// === Utility Functions ===
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

async function downloadPdfFromUrl(url, filePath) {
  try {
    const writer = fs.createWriteStream(filePath);
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        const stats = fs.statSync(filePath);
        if (stats.size >= MIN_VALID_SIZE) {
          console.log(`✅ Downloaded: ${url}`);
          resolve(true);
        } else {
          fs.unlinkSync(filePath);
          console.warn(`❌ Download too small: ${url}`);
          resolve(false);
        }
      });
      writer.on('error', reject);
    });
  } catch (err) {
    console.error(`❌ Download failed: ${url}`, err.message);
    return false;
  }
}

async function extractPdfLinkAndDownload(doi, mirror, outputPath) {
  try {
    const url = mirror + encodeURIComponent(doi);
    const response = await axios.get(url, { httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
    const html = response.data;

    const embedMatch = html.match(/<embed[^>]*src=["']([^"']+\.pdf[^"']*)["']/i);
    if (!embedMatch || !embedMatch[1]) {
      console.warn(`❌ No PDF embed found for ${doi}`);
      return false;
    }

    let pdfUrl = embedMatch[1];
    if (pdfUrl.startsWith('//')) {
      pdfUrl = 'https:' + pdfUrl;
    } else if (!pdfUrl.startsWith('http')) {
      pdfUrl = mirror + (pdfUrl.startsWith('/') ? pdfUrl.slice(1) : pdfUrl);
    }

    return await downloadPdfFromUrl(pdfUrl, outputPath);
  } catch (err) {
    console.warn(`❌ Error scraping ${mirror} for ${doi}: ${err.message}`);
    return false;
  }
}

async function tryAllMirrors(doi, outputPath) {
  for (const mirror of SCI_HUB_MIRRORS) {
    const success = await extractPdfLinkAndDownload(doi, mirror, outputPath);
    if (success) return true;
    await sleep(1000);
  }
  return false;
}

async function processPage(pageFile) {
  const pageNum = pageFile.match(/\d+/)[0];
  const doiPath = path.join(DOI_DIR, pageFile);
  const outDir = path.join(PDF_DIR, `page_${pageNum}`);
  ensureDir(outDir);

  const failedLogPath = path.join(outDir, `failed_log_page_${pageNum}.txt`);
  let failedDois = new Set();
  if (fs.existsSync(failedLogPath)) {
    failedDois = new Set(fs.readFileSync(failedLogPath, 'utf8').split('\n').filter(Boolean));
  }

  const dois = JSON.parse(fs.readFileSync(doiPath, 'utf8'));

  for (const doi of dois) {
    const doiSafe = encodeURIComponent(doi);
    const pdfPath = path.join(outDir, `${doiSafe}.pdf`);

    if (fs.existsSync(pdfPath)) {
      const stats = fs.statSync(pdfPath);
      if (stats.size >= MIN_VALID_SIZE) {
        console.log(`✅ Already exists: ${pdfPath}`);
        continue;
      } else {
        console.warn(`⚠️ Removing invalid file: ${pdfPath}`);
        fs.unlinkSync(pdfPath);
      }
    }

    if (failedDois.has(doi)) {
      console.log(`⚠️ Previously failed: ${doi}, skipping`);
      continue;
    }

    console.log(`📄 Downloading DOI: ${doi}`);
    const success = await tryAllMirrors(doi, pdfPath);
    if (!success) {
      fs.appendFileSync(failedLogPath, `${doi}\n`);
      console.error(`❌ Failed to download ${doi}`);
    }

    await sleep(DELAY_MS);
  }
}

async function main() {
  ensureDir(PDF_DIR);

  const pageFiles = fs.readdirSync(DOI_DIR)
    .filter(f => f.startsWith('page_') && f.endsWith('.json'))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  const filtered = pageFiles.filter(f => {
    const page = parseInt(f.match(/\d+/)[0], 10);
    return (!cliStart || page >= cliStart) && (!cliEnd || page <= cliEnd);
  });

  for (const file of filtered) {
    console.log(`\n=== Processing ${file} ===`);
    await processPage(file);
  }

  console.log('\n🎉 All requested PDF downloads finished.');
}

main();
