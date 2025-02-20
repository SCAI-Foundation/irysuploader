require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");

const MAX_SLICE_SIZE = 50 * 1024; // 50KB per slice

const getIrysUploader = async () => {
    try {
        const irysUploader = await Uploader(Solana).withWallet(process.env.PRIVATE_KEY);
        console.log("Irys uploader initialized.");
        return irysUploader;
    } catch (error) {
        console.error("Failed to initialize Irys uploader:", error);
        return null;
    }
};

async function walkDir(dir) {
    try {
        const files = await fs.readdir(dir);
        const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
        return pdfFiles.map(file => path.join(dir, file));
    } catch (error) {
        console.error('Error reading directory:', error);
        throw error;
    }
}

async function getDoiFromMetadata(pdfPath) {
    try {
        // Get the corresponding JSON file path by replacing .pdf with .json
        const jsonPath = pdfPath.replace('.pdf', '.json');
        
        console.log(`Looking for metadata file: ${jsonPath}`);
        
        // Read and parse the JSON file
        const jsonData = await fs.readFile(jsonPath, 'utf8');
        const metadata = JSON.parse(jsonData);
        
        if (!metadata.doi) {
            throw new Error(`No DOI found in metadata file: ${jsonPath}`);
        }

        console.log(`Found DOI: ${metadata.doi}`);
        return metadata.doi;
    } catch (error) {
        console.error(`Error getting DOI from metadata:`, error);
        throw error;
    }
}

const sliceAndUploadPdf = async (inputPath, doi) => {
    try {
        console.log(`\n📄 Processing PDF: ${path.basename(inputPath)}`);
        
        // Read and validate PDF
        const pdfBytes = await fs.readFile(inputPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const fileBase64 = await pdfDoc.saveAsBase64();

        // Create chunks
        const chunks = [];
        for (let i = 0; i < fileBase64.length; i += MAX_SLICE_SIZE) {
            const chunk = fileBase64.slice(i, i + MAX_SLICE_SIZE);
            chunks.push(chunk);
        }

        console.log(`File size: ${fileBase64.length} bytes`);
        console.log(`Total chunks: ${chunks.length}`);

        // Check if PDF was already uploaded
        const query = `
            query {
                transactions(
                    tags: [
                        { name: "Content-Type", values: ["application/pdf"] },
                        { name: "application", values: ["scivault"] },
                        { name: "Version", values: ["1.0.3"] },
                        { name: "Type", values: ["pdf-index"] },
                        { name: "Collection", values: ["${doi}"] }
                    ]
                ) {
                    edges {
                        node {
                            id
                        }
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
        if (result.data?.transactions?.edges?.[0]?.node?.id) {
            console.log(`⚠️ PDF already exists for DOI: ${doi}`);
            return result.data.transactions.edges.map(edge => edge.node.id);
        }

        // Upload chunks
        const irys = await getIrysUploader();
        if (!irys) {
            throw new Error("Failed to initialize Irys uploader");
        }

        const receiptIDs = [];
        const tags = [
            { name: "Content-Type", value: "application/pdf" },
            { name: "application", value: "scivault" },
            { name: "Version", value: "1.0.3" },
            { name: "Type", value: "pdf-index" },
            { name: "Collection", value: doi }
        ];

        for (let i = 0; i < chunks.length; i++) {
            console.log(`\nUploading chunk ${i + 1}/${chunks.length}...`);
            const receipt = await irys.upload(Buffer.from(chunks[i]), { tags });
            receiptIDs.push(receipt.id);
            console.log(`✅ Chunk uploaded: ${receipt.id}`);
        }

        console.log(`\n✨ PDF uploaded successfully!`);
        console.log(`Receipt IDs: ${receiptIDs.join(", ")}`);
        return receiptIDs;

    } catch (error) {
        console.error(`❌ Error processing PDF: ${error.message}`);
        throw error;
    }
};

// 添加错误日志功能
async function logError(filePath, error, doi = null) {
    const errorLogPath = path.join(process.cwd(), 'upload_errors.json');
    try {
        // 读取现有的错误日志，如果不存在则创建新的
        let errorLog = [];
        try {
            const existingLog = await fs.readFile(errorLogPath, 'utf8');
            errorLog = JSON.parse(existingLog);
        } catch (e) {
            // 文件不存在，使用空数组
        }

        // 添加新的错误记录
        errorLog.push({
            timestamp: new Date().toISOString(),
            file: filePath,
            doi: doi,
            error: error.message || String(error),
            stack: error.stack
        });

        // 保存更新后的错误日志
        await fs.writeFile(errorLogPath, JSON.stringify(errorLog, null, 2));
        console.log(`Error logged to ${errorLogPath}`);
    } catch (logError) {
        console.error('Failed to log error:', logError);
    }
}

const uploadPdfs = async (pdfDir) => {
    try {
        const files = await walkDir(pdfDir);
        console.log(`Found ${files.length} PDF files in ${pdfDir}`);

        let successCount = 0;
        let failCount = 0;
        let errorFiles = [];

        for (let i = 0; i < files.length; i++) {
            const pdfFile = files[i];
            let doi = null;
            try {
                // 获取 DOI
                doi = await getDoiFromMetadata(pdfFile);
                console.log(`\nProcessing PDF: ${path.basename(pdfFile)}`);
                console.log(`Using DOI: ${doi}`);
                
                // 尝试上传
                await sliceAndUploadPdf(pdfFile, doi);
                successCount++;
            } catch (error) {
                failCount++;
                await logError(pdfFile, error, doi);
                errorFiles.push({
                    file: pdfFile,
                    doi: doi,
                    error: error.message
                });
            }

            // Progress report
            if ((i + 1) % 5 === 0 || i === files.length - 1) {
                console.log(`\n📊 Progress Report:`);
                console.log(`   Success: ${successCount}`);
                console.log(`   Failed: ${failCount}`);
                console.log(`   Progress: ${Math.round((i + 1) / files.length * 100)}%`);
            }
        }

        // 在完成时生成详细报告
        const report = {
            timestamp: new Date().toISOString(),
            totalFiles: files.length,
            successCount,
            failCount,
            successRate: `${Math.round(successCount / files.length * 100)}%`,
            failedFiles: errorFiles
        };

        // 保存报告
        const reportPath = path.join(process.cwd(), 'upload_report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n🎉 Upload Complete`);
        console.log(`   Total Success: ${successCount}`);
        console.log(`   Total Failed: ${failCount}`);
        console.log(`   Success Rate: ${Math.round(successCount / files.length * 100)}%`);
        console.log(`   Detailed report saved to: ${reportPath}`);
        if (failCount > 0) {
            console.log(`   Error log saved to: upload_errors.json`);
        }

    } catch (error) {
        console.error("❌ Error in upload process:", error);
        await logError('global', error);
    }
};

// If running directly
if (require.main === module) {
    const metadataDir = process.argv[2] || path.join(process.cwd(), 'metadata');
    uploadPdfs(metadataDir).catch(console.error);
}

module.exports = {
    getIrysUploader,
    sliceAndUploadPdf,
    uploadPdfs
};
