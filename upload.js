require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const fs = require("fs");

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

const uploadMetadata = async () => {
    const irys = await getIrysUploader();
    if (!irys) {
        console.error("Irys uploader could not be initialized.");
        return;
    }

    try {
        const metadataPath = "./100file.json";
        const metadataString = fs.readFileSync(metadataPath, 'utf8');
        const papers = JSON.parse(metadataString);

        console.log(`Found ${papers.length} papers to upload`);
        
        const uploadRecords = [];

        for (const paper of papers) {
            try {
                if (!paper.doi) {
                    console.log(`Skipping paper ${paper.aid}: No DOI found`);
                    continue;
                }

                const tags = [
                    { name: "App-Name", value: "scivault" },
                    { name: "Content-Type", value: "application/json" },
                    { name: "Version", value: "0.1.1" },
                    { name: "doi", value: paper.doi },
                    { name: "title", value: paper.title.replace(/\n\s*/g, ' ').trim() },
                    { name: "authors", value: paper.authors.replace(/\n\s*/g, ' ').trim() },
                    { name: "aid", value: paper.aid }
                ];

                const paperMetadata = Buffer.from(JSON.stringify(paper));
                
                console.log(`\nUploading paper with DOI: ${paper.doi}`);
                const receipt = await irys.upload(paperMetadata, {
                    tags: tags
                });

                console.log(`Paper uploaded successfully!
                    DOI: ${paper.doi}
                    Transaction ID: ${receipt.id}
                    Explorer URL: https://gateway.irys.xyz/${receipt.id}`);

                uploadRecords.push({
                    doi: paper.doi,
                    aid: paper.aid,
                    transactionId: receipt.id,
                    uploadTime: new Date().toISOString()
                });
            } catch (uploadError) {
                console.error(`Error uploading paper with DOI ${paper.doi}:`, uploadError);
                continue;
            }
        }

        fs.writeFileSync('metadata-uploads.json', JSON.stringify(uploadRecords, null, 2));
        console.log('\nAll papers uploaded successfully! Records saved to metadata-uploads.json');

    } catch (error) {
        console.error("Error uploading metadata:", error);
    }
};

uploadMetadata();
