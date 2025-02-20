require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const fs = require("fs").promises;
const path = require("path");

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
        const jsonFiles = files.filter(file => file.toLowerCase().endsWith('.json'));
        return jsonFiles.map(file => path.join(dir, file));
    } catch (error) {
        console.error('Error reading directory:', error);
        throw error;
    }
}

async function uploadMetadata(jsonPath) {
    try {
        console.log(`\n📄 Processing metadata: ${path.basename(jsonPath)}`);
        
        // Read and parse JSON file
        const jsonData = await fs.readFile(jsonPath, 'utf8');
        const metadata = JSON.parse(jsonData);
        
        if (!metadata.doi) {
            throw new Error(`No DOI found in metadata file: ${jsonPath}`);
        }

        // Check if metadata was already uploaded
        const query = `
            query {
                transactions(
                    tags: [
                        { name: "Content-Type", values: ["metadata/json"] },
                        { name: "App-Name", values: ["scivault"] },
                        { name: "Version", values: ["1.0.3"] },
                        { name: "doi", values: ["${metadata.doi}"] }
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
            console.log(`⚠️ Metadata already exists for DOI: ${metadata.doi}`);
            return result.data.transactions.edges[0].node.id;
        }

        // Upload metadata
        const irys = await getIrysUploader();
        if (!irys) {
            throw new Error("Failed to initialize Irys uploader");
        }

        // 使用原始 metadata 数据作为上传内容
        const tags = [
            { name: "Content-Type", value: "metadata/json" },
            { name: "App-Name", value: "scivault" },
            { name: "Version", value: "1.0.3" }
        ];

        // 将 metadata 中的所有字段添加为标签
        for (const [key, value] of Object.entries(metadata)) {
            if (value && typeof value === 'string') {
                tags.push({ name: key, value: value });
            }
        }

        const receipt = await irys.upload(jsonData, { tags });
        console.log(`✅ Metadata uploaded: ${receipt.id}`);
        return receipt.id;

    } catch (error) {
        console.error(`❌ Error processing metadata: ${error.message}`);
        throw error;
    }
}

async function logError(filePath, error, doi = null) {
    const errorLogPath = path.join(process.cwd(), 'metadata_upload_errors.json');
    try {
        let errorLog = [];
        try {
            const existingLog = await fs.readFile(errorLogPath, 'utf8');
            errorLog = JSON.parse(existingLog);
        } catch (e) {
            // File doesn't exist, use empty array
        }

        errorLog.push({
            timestamp: new Date().toISOString(),
            file: filePath,
            doi: doi,
            error: error.message || String(error),
            stack: error.stack
        });

        await fs.writeFile(errorLogPath, JSON.stringify(errorLog, null, 2));
        console.log(`Error logged to ${errorLogPath}`);
    } catch (logError) {
        console.error('Failed to log error:', logError);
    }
}

const uploadAllMetadata = async (metadataDir) => {
    try {
        const files = await walkDir(metadataDir);
        console.log(`Found ${files.length} JSON files in ${metadataDir}`);

        let successCount = 0;
        let failCount = 0;
        let errorFiles = [];

        for (let i = 0; i < files.length; i++) {
            const jsonFile = files[i];
            let doi = null;
            try {
                const jsonData = await fs.readFile(jsonFile, 'utf8');
                const metadata = JSON.parse(jsonData);
                doi = metadata.doi;

                await uploadMetadata(jsonFile);
                successCount++;
            } catch (error) {
                failCount++;
                await logError(jsonFile, error, doi);
                errorFiles.push({
                    file: jsonFile,
                    doi: doi,
                    error: error.message
                });
            }

            if ((i + 1) % 5 === 0 || i === files.length - 1) {
                console.log(`\n📊 Progress Report:`);
                console.log(`   Success: ${successCount}`);
                console.log(`   Failed: ${failCount}`);
                console.log(`   Progress: ${Math.round((i + 1) / files.length * 100)}%`);
            }
        }

        const report = {
            timestamp: new Date().toISOString(),
            totalFiles: files.length,
            successCount,
            failCount,
            successRate: `${Math.round(successCount / files.length * 100)}%`,
            failedFiles: errorFiles
        };

        const reportPath = path.join(process.cwd(), 'metadata_upload_report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n🎉 Upload Complete`);
        console.log(`   Total Success: ${successCount}`);
        console.log(`   Total Failed: ${failCount}`);
        console.log(`   Success Rate: ${Math.round(successCount / files.length * 100)}%`);
        console.log(`   Detailed report saved to: ${reportPath}`);
        if (failCount > 0) {
            console.log(`   Error log saved to: metadata_upload_errors.json`);
        }

    } catch (error) {
        console.error("❌ Error in upload process:", error);
        await logError('global', error);
    }
};

if (require.main === module) {
    const metadataDir = process.argv[2] || path.join(process.cwd(), 'metadata');
    uploadAllMetadata(metadataDir).catch(console.error);
}

module.exports = {
    getIrysUploader,
    uploadMetadata,
    uploadAllMetadata
};
