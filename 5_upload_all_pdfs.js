require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const fs = require("fs").promises;
const path = require("path");

// === CONFIG ===
const BASE_PDF_DIR = path.join(process.cwd(), "pdf");
const MIN_VALID_SIZE = 1000; // in bytes
const REPORT_PREFIX = "upload_pdf_report";

// === CLI ===
const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find(arg => arg.startsWith(prefix));
  return found ? parseInt(found.slice(prefix.length), 10) : undefined;
};
const cliStart = getArg("start-page");
const cliEnd = getArg("end-page");

// === Uploader ===
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

// === DOI Utilities ===
function extractDoiFromFilename(filename) {
  const base = path.basename(filename, ".pdf");
  return decodeURIComponent(base).replace(/%2F/g, "/").trim();
}

// === Check existing upload ===
async function checkIfAlreadyUploaded(doi) {
  const query = `
    query {
      transactions(
        tags: [
          { name: "App-Name", values: ["scivault"] },
          { name: "Content-Type", values: ["application/pdf"] },
          { name: "Version", values: ["2.0.0"] },
          { name: "doi", values: ["${doi}"] }
        ]
      ) {
        edges {
          node { id }
        }
      }
    }
  `;

  const response = await fetch("https://uploader.irys.xyz/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });

  const result = await response.json();
  return result.data?.transactions?.edges?.[0]?.node?.id || null;
}

// === Upload one PDF ===
async function uploadOnePdf(irys, filePath) {
  try {
    const doi = extractDoiFromFilename(filePath);
    if (!doi) throw new Error("Invalid DOI from filename");

    const alreadyUploaded = await checkIfAlreadyUploaded(doi);
    if (alreadyUploaded) {
      console.log(`⚠️ Already uploaded: ${doi}`);
      return { status: "skip", doi };
    }

    const buffer = await fs.readFile(filePath);
    if (buffer.length < MIN_VALID_SIZE) {
      throw new Error("File too small (<1KB)");
    }

    const tags = [
      { name: "App-Name", value: "scivault" },
      { name: "Content-Type", value: "application/pdf" },
      { name: "Version", value: "2.0.0" },
      { name: "doi", value: doi }
    ];

    const receipt = await irys.upload(buffer, { tags });
    console.log(`✅ Uploaded ${doi} - ${receipt.id}`);


    return { status: "ok", doi, id: receipt.id };
  } catch (error) {
    console.error(`❌ Failed upload: ${filePath} - ${error.message}`);
    return { status: "fail", file: filePath, error: error.message };
  }
}

// === Process one page folder ===
async function processPageFolder(irys, pageDir) {
  const pageNum = pageDir.match(/page_(\d+)/)?.[1];
  const files = await fs.readdir(pageDir);
  const pdfFiles = files.filter(f => f.endsWith(".pdf"));

  console.log(`📂 Processing page_${pageNum} - Found ${pdfFiles.length} PDFs`);

  const result = { ok: [], fail: [], skip: [] };

  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    const filePath = path.join(pageDir, file);
    const res = await uploadOnePdf(irys, filePath);


    // 在 uploadOnePdf 函数中，上传成功后添加：
    if (res.status === "ok") {
      result.ok.push(res);
      // 删除本地 PDF 文件
      await fs.unlink(filePath);
      console.log(`🗑️ Deleted local file: ${filePath}`);
    }

    // if (res.status === "ok") result.ok.push(res);
    else if (res.status === "fail") result.fail.push(res);
    else if (res.status === "skip") result.skip.push(res);

    if ((i + 1) % 10 === 0 || i === pdfFiles.length - 1) {
      console.log(`📊 Progress: ${i + 1}/${pdfFiles.length}`);
    }
  }

  // Save report
  const report = {
    page: `page_${pageNum}`,
    timestamp: new Date().toISOString(),
    total: pdfFiles.length,
    success: result.ok.length,
    failed: result.fail.length,
    skipped: result.skip.length,
    successRate: `${Math.round((result.ok.length / pdfFiles.length) * 100)}%`,
    details: result
  };

  const reportPath = path.join(pageDir, `${REPORT_PREFIX}_page_${pageNum}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`📝 Report saved to ${reportPath}`);
}

// === Main ===
(async () => {
  const irys = await getIrysUploader();
  if (!irys) return;

  const dirs = await fs.readdir(BASE_PDF_DIR);
  const pageDirs = dirs
    .filter(d => d.startsWith("page_"))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]))
    .filter(d => {
      const page = parseInt(d.match(/\d+/)[0]);
      if (cliStart && page < cliStart) return false;
      if (cliEnd && page > cliEnd) return false;
      return true;
    });

  for (const dir of pageDirs) {
    const fullPath = path.join(BASE_PDF_DIR, dir);
    const stat = await fs.lstat(fullPath);
    if (stat.isDirectory()) {
      await processPageFolder(irys, fullPath);
    }
  }

  console.log("\n🎉 All PDF uploads completed.");
})();
