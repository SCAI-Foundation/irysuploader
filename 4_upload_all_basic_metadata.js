require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const fs = require("fs").promises;
const path = require("path");

// === Configuration ===
const PDF_BASE_DIR = './pdf';
const REPORT_FILENAME = 'upload_basic_metadata_report.txt';

// === CLI Argument Parser ===
const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find(arg => arg.startsWith(prefix));
  return found ? parseInt(found.slice(prefix.length), 10) : undefined;
};
const cliStart = getArg("start-page");
const cliEnd = getArg("end-page");

// === Initialize Irys uploader ===
const getIrysUploader = async () => {
  try {
    const irysUploader = await Uploader(Solana).withWallet(process.env.PRIVATE_KEY);
    console.log("✅ Irys uploader initialized.");
    return irysUploader;
  } catch (error) {
    console.error("❌ Failed to initialize Irys uploader:", error);
    return null;
  }
};

// === Upload a single paper ===
const uploadOneMetadata = async (irys, paper, pageNum, index) => {
  if (!paper.doi) {
    console.log(`⚠️ Skipping paper at page ${pageNum}, index ${index}: No DOI`);
    return { ok: false, reason: 'no-doi' };
  }

  try {
    const normalizedDoi = paper.doi.trim();
    const normalizedTitle = (paper.title || "").replace(/\s+/g, ' ').trim();
    const normalizedAuthors = (paper.authors || "").replace(/\s+/g, ' ').trim();

    const tags = [
      { name: "App-Name", value: "scivault" },
      { name: "Content-Type", value: "application/json" },
      { name: "Version", value: "2.0.0" },
      { name: "doi", value: normalizedDoi },
      { name: "title", value: normalizedTitle },
      { name: "authors", value: normalizedAuthors },
      { name: "aid", value: paper.aid || "" }
    ];

    const buffer = Buffer.from(JSON.stringify(paper));
    const receipt = await irys.upload(buffer, { tags });

    console.log(`✅ Uploaded [page_${pageNum} - ${index}]: ${normalizedDoi} (${receipt.id})`);
    return { ok: true, id: receipt.id };
  } catch (err) {
    console.error(`❌ Upload failed [page_${pageNum} - ${index}]: ${paper.doi} - ${err.message}`);
    return { ok: false, reason: err.message };
  }
};

// === Process one page folder ===
const uploadPageFolder = async (irys, pageDir) => {
  const pageNum = pageDir.match(/\d+/)?.[0] || '?';
  const metaPath = path.join(PDF_BASE_DIR, pageDir, 'basic_metadata.json');
  const reportPath = path.join(PDF_BASE_DIR, pageDir, REPORT_FILENAME);

  try {
    await fs.access(metaPath);
  } catch {
    console.warn(`⚠️ Skipping page_${pageNum}: no basic_metadata.json`);
    return;
  }

  const jsonText = await fs.readFile(metaPath, 'utf8');
  const papers = JSON.parse(jsonText);

  console.log(`\n📄 Found ${papers.length} papers in page_${pageNum}`);
  const reportLines = [];

  let success = 0;
  let fail = 0;

  for (let i = 0; i < papers.length; i++) {
    const result = await uploadOneMetadata(irys, papers[i], pageNum, i);
    const doi = papers[i].doi || '[no-doi]';

    if (result.ok) {
      success++;
      reportLines.push(`✅ ${doi} : ${result.id}`);
    } else {
      fail++;
      reportLines.push(`❌ ${doi} : ${result.reason}`);
    }

    if ((i + 1) % 10 === 0 || i === papers.length - 1) {
      console.log(`📊 page_${pageNum} progress: ${i + 1}/${papers.length}, ✅ ${success}, ❌ ${fail}`);
    }
  }

  await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`📄 Upload report saved: ${reportPath}`);
  console.log(`✨ Finished page_${pageNum}: ✅ ${success}, ❌ ${fail}`);
};

// === Main Execution ===
(async () => {
  const irys = await getIrysUploader();
  if (!irys) return;

  const dirs = await fs.readdir(PDF_BASE_DIR);
  const pageDirs = dirs
    .filter(d => d.startsWith('page_'))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]))
    .filter(d => {
      const page = parseInt(d.match(/\d+/)[0], 10);
      if (cliStart && page < cliStart) return false;
      if (cliEnd && page > cliEnd) return false;
      return true;
    });

  for (const pageDir of pageDirs) {
    await uploadPageFolder(irys, pageDir);
  }

  console.log('\n🎉 All basic metadata uploads completed.');
})();
