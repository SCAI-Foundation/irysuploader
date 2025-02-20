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

const uploadBasicMetadata = async () => {
    const irys = await getIrysUploader();
    if (!irys) {
        console.error("Irys uploader could not be initialized.");
        return;
    }

    try {
        // Read the basic_metadata.json file
        const filePath = path.join(process.cwd(), 'basic_metadata.json');
        console.log(`Reading file: ${filePath}`);
        
        const content = await fs.readFile(filePath, 'utf8');
        const papers = JSON.parse(content);
        
        console.log(`Loaded ${papers.length} papers for processing`);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < papers.length; i++) {
            const paper = papers[i];
            console.log(`\n📄 Processing paper [${i + 1}/${papers.length}]`);

            if (!paper.doi) {
                console.log(`⚠️ Skipping paper: No DOI found`);
                failCount++;
                continue;
            }

            try {
                const normalizedDoi = paper.doi.trim();
                const normalizedTitle = paper.title
                    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
                    .replace(/\n/g, '')    // Remove newlines
                    .trim();               // Remove leading/trailing spaces

                const normalizedAuthors = paper.authors
                    .replace(/\s+/g, ' ')
                    .replace(/\n/g, '')
                    .trim();

                const tags = [
                    { name: "App-Name", value: "scivault" },
                    { name: "Content-Type", value: "application/json" },
                    { name: "Version", value: "1.0.3" },
                    { name: "doi", value: normalizedDoi },
                    { name: "title", value: normalizedTitle },
                    { name: "authors", value: normalizedAuthors },
                    { name: "aid", value: paper.aid }
                ];

                const paperMetadata = Buffer.from(JSON.stringify(paper));
                const receipt = await irys.upload(paperMetadata, { tags });

                console.log(`✅ Uploaded: ${paper.doi} (${receipt.id})`);
                successCount++;

            } catch (error) {
                console.error(`❌ Failed: ${paper.doi} - ${error.message}`);
                failCount++;
            }

            // Progress report every 10 papers
            if ((i + 1) % 10 === 0 || i === papers.length - 1) {
                console.log(`\n📊 Progress Report:`);
                console.log(`   Success: ${successCount}`);
                console.log(`   Failed: ${failCount}`);
                console.log(`   Progress: ${Math.round((i + 1) / papers.length * 100)}%`);
            }
        }

        console.log(`\n✨ Upload Complete`);
        console.log(`   Final Results:`);
        console.log(`   Total Success: ${successCount}`);
        console.log(`   Total Failed: ${failCount}`);
        console.log(`   Success Rate: ${Math.round(successCount / papers.length * 100)}%`);

    } catch (error) {
        console.error("❌ Error uploading metadata:", error);
    }
};

// Run the upload process
uploadBasicMetadata().catch(console.error);
