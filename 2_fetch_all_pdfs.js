const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

// === Configuration ===
const DOI_DIR = './doi';
const PDF_DIR = './pdf';
const DEFAULT_SCI_HUB_MIRRORS = [
  'https://sci-hub.st/',
  'https://sci-hub.se/',
  'https://sci-hub.ru/',
  'https://www.tesble.com/',
];
const DELAY_MS = 3000;
const MIN_VALID_SIZE = 1024;
const RETRY_ATTEMPTS = 3;

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
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      console.log(`📥 开始下载 (尝试 ${attempt}): ${url} -> ${filePath}`);
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/pdf',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 10000,
      });

      fs.writeFileSync(filePath, response.data);
      const stats = fs.statSync(filePath);
      if (stats.size >= MIN_VALID_SIZE) {
        console.log(`✅ 成功下载: ${url}`);
        return true;
      } else {
        fs.unlinkSync(filePath);
        console.warn(`❌ 下载文件太小: ${url}`);
        return false;
      }
    } catch (err) {
      console.error(`❌ 下载失败 (尝试 ${attempt}): ${url} - ${err.message}`);
      if (attempt < RETRY_ATTEMPTS) await sleep(1000);
    }
  }
  return false;
}

async function getSciHubUrls() {
  try {
    const url = 'https://www.sci-hub.pub';
    console.log(`📡 正在获取 Sci-Hub 镜像列表: ${url}`);
    const response = await axios.get(url, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
    });
    const html = response.data;
    const pattern = /<a[^>]*href="([^"]+)"[^>]*>/gi;
    const matches = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const href = match[1];
      if (href.includes('sci-hub') && href.startsWith('http')) {
        matches.push(href.endsWith('/') ? href : `${href}/`);
      }
    }
    matches.push('https://www.tesble.com/');
    console.log(`📡 获取的 Sci-Hub 镜像: ${matches.join(', ')}`);
    return matches.length > 0 ? matches : DEFAULT_SCI_HUB_MIRRORS;
  } catch (err) {
    console.error(`❌ 获取 Sci-Hub 镜像失败: ${err.message}`);
    return DEFAULT_SCI_HUB_MIRRORS;
  }
}

async function extractPdfLinkAndDownload(doi, mirror, outputPath) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const url = mirror + encodeURIComponent(doi);
      console.log(`🔍 访问 Sci-Hub (尝试 ${attempt}): ${url}`);
      const response = await axios.get(url, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 10000,
      });
      const html = response.data;

      const embedMatch = html.match(/<embed[^>]*src=["']([^"']+\.pdf[^"']*)["']/i);
      if (!embedMatch || !embedMatch[1]) {
        console.warn(`❌ 未找到 PDF embed 标签: ${doi}`);
        return null;
      }

      let pdfUrl = embedMatch[1];
      if (pdfUrl.startsWith('//')) {
        pdfUrl = 'https:' + pdfUrl;
      } else if (!pdfUrl.startsWith('http')) {
        pdfUrl = mirror + (pdfUrl.startsWith('/') ? pdfUrl.slice(1) : pdfUrl);
      }

      const success = await downloadPdfFromUrl(pdfUrl, outputPath);
      return success ? true : null;
    } catch (err) {
      console.warn(`❌ 抓取 ${mirror} 的 ${doi} 失败 (尝试 ${attempt}): ${err.message}`);
      if (attempt < RETRY_ATTEMPTS) await sleep(1000);
    }
  }
  return null;
}

async function tryAllMirrors(doi, outputPath, sciHubUrls) {
  for (const mirror of sciHubUrls) {
    const result = await extractPdfLinkAndDownload(doi, mirror, outputPath);
    if (result === true) return true;
    await sleep(1000);
  }
  return false;
}

async function processPage(pageFile, sciHubUrls) {
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
        console.log(`✅ PDF 已存在: ${pdfPath}`);
        continue;
      }
      console.warn(`⚠️ 删除无效 PDF: ${pdfPath}`);
      fs.unlinkSync(pdfPath);
    }

    if (failedDois.has(doi)) {
      console.log(`⚠️ 之前失败，跳过: ${doi}`);
      continue;
    }

    console.log(`📄 处理 DOI: ${doi}`);
    const success = await tryAllMirrors(doi, pdfPath, sciHubUrls);
    if (!success) {
      fs.appendFileSync(failedLogPath, `${doi}\n`);
      console.error(`❌ 下载 ${doi} 失败`);
    }

    await sleep(DELAY_MS);
  }
}

async function main() {
  ensureDir(PDF_DIR);

  const sciHubUrls = await getSciHubUrls();

  const pageFiles = fs.readdirSync(DOI_DIR)
    .filter(f => f.startsWith('page_') && f.endsWith('.json'))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  const filtered = pageFiles.filter(f => {
    const page = parseInt(f.match(/\d+/)[0], 10);
    return (!cliStart || page >= cliStart) && (!cliEnd || page <= cliEnd);
  });

  for (const file of filtered) {
    console.log(`\n=== 处理 ${file} ===`);
    await processPage(file, sciHubUrls);
  }

  console.log('\n🎉 所有请求的 PDF 下载完成。');
}

main();