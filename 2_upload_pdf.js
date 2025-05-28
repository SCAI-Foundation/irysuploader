require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const fs = require("fs").promises;
const path = require("path");

// 初始化 Irys 上传器
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

// 遍历目录查找 PDF 文件
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

// 读取 JSON 元数据文件中的 DOI
async function getDoiFromMetadata(pdfPath) {
    try {
        const jsonPath = pdfPath.replace('.pdf', '.json');
        console.log(`🔍 Looking for metadata file: ${jsonPath}`);
        const jsonData = await fs.readFile(jsonPath, 'utf8');
        const metadata = JSON.parse(jsonData);
        if (!metadata.doi) throw new Error(`No DOI found in metadata file: ${jsonPath}`);
        console.log(`✅ Found DOI: ${metadata.doi}`);
        return metadata.doi;
    } catch (error) {
        console.error(`❌ Error getting DOI from metadata:`, error);
        throw error;
    }
}

// 上传单个 PDF（不再切片）
const uploadPdf = async (inputPath, doi) => {
    try {
        console.log(`\n📄 Processing PDF: ${path.basename(inputPath)}`);

        // 1. 检查是否已上传过
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
        if (result.data?.transactions?.edges?.[0]?.node?.id) {
            console.log(`⚠️ PDF already uploaded for DOI: ${doi}`);
            return result.data.transactions.edges.map(edge => edge.node.id);
        }

        // 2. 上传 PDF
        const irys = await getIrysUploader();
        if (!irys) throw new Error("Failed to initialize Irys uploader");

        const buffer = await fs.readFile(inputPath);
        const tags = [
            { name: "App-Name", value: "scivault" },
            { name: "Content-Type", value: "application/pdf" },
            { name: "Version", value: "2.0.0" },
            { name: "doi", value: doi }
        ];

        const receipt = await irys.upload(buffer, { tags });
        console.log(`✅ PDF uploaded successfully. Transaction ID: ${receipt.id}`);
        return [receipt.id];

    } catch (error) {
        console.error(`❌ Error uploading PDF: ${error.message}`);
        throw error;
    }
};

// 错误记录
async function logError(filePath, error, doi = null) {
    const errorLogPath = path.join(process.cwd(), 'upload_errors.json');
    try {
        let errorLog = [];
        try {
            const existingLog = await fs.readFile(errorLogPath, 'utf8');
            errorLog = JSON.parse(existingLog);
        } catch {}

        errorLog.push({
            timestamp: new Date().toISOString(),
            file: filePath,
            doi: doi,
            error: error.message || String(error),
            stack: error.stack
        });

        await fs.writeFile(errorLogPath, JSON.stringify(errorLog, null, 2));
        console.log(`📝 Error logged to ${errorLogPath}`);
    } catch (logError) {
        console.error('❌ Failed to log error:', logError);
    }
}

// 批量上传 PDF 主函数
const uploadPdfs = async (pdfDir) => {
    try {
        const files = await walkDir(pdfDir);
        console.log(`\n📁 Found ${files.length} PDF files in ${pdfDir}`);

        let successCount = 0;
        let failCount = 0;
        let errorFiles = [];

        for (let i = 0; i < files.length; i++) {
            const pdfFile = files[i];
            let doi = null;
            try {
                doi = await getDoiFromMetadata(pdfFile);
                await uploadPdf(pdfFile, doi);
                successCount++;
            } catch (error) {
                failCount++;
                await logError(pdfFile, error, doi);
                errorFiles.push({ file: pdfFile, doi: doi, error: error.message });
            }

            if ((i + 1) % 5 === 0 || i === files.length - 1) {
                console.log(`\n📊 Progress Report:`);
                console.log(`   ✅ Success: ${successCount}`);
                console.log(`   ❌ Failed: ${failCount}`);
                console.log(`   🔄 Progress: ${Math.round((i + 1) / files.length * 100)}%`);
            }
        }

        // 写入报告
        const report = {
            timestamp: new Date().toISOString(),
            totalFiles: files.length,
            successCount,
            failCount,
            successRate: `${Math.round(successCount / files.length * 100)}%`,
            failedFiles: errorFiles
        };

        const reportPath = path.join(process.cwd(), 'upload_report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n🎉 Upload Complete`);
        console.log(`   ✅ Total Success: ${successCount}`);
        console.log(`   ❌ Total Failed: ${failCount}`);
        console.log(`   📄 Report saved to: ${reportPath}`);
        if (failCount > 0) {
            console.log(`   📌 Error log saved to: upload_errors.json`);
        }

    } catch (error) {
        console.error("❌ Error in upload process:", error);
        await logError('global', error);
    }
};

// CLI 执行入口
if (require.main === module) {
    const metadataDir = process.argv[2] || path.join(process.cwd(), 'metadata');
    uploadPdfs(metadataDir).catch(console.error);
}

// 可导出函数供其他模块调用
module.exports = {
    getIrysUploader,
    uploadPdf,
    uploadPdfs
};
