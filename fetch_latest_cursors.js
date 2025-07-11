// fetch_latest_cursors.js - Get all cursors and upload statistics
require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');

// Initialize Irys uploader
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

// Get all PDF transaction cursors
async function fetchAllCursors() {
    const allCursors = [];
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;
    const startTime = Date.now();

    console.log('Starting to fetch all cursors...');

    while (hasNextPage) {
        const pageStartTime = Date.now();
        const query = `
            query {
                transactions(
                    tags: [
                        { name: "App-Name", values: ["scivault"] },
                        { name: "Content-Type", values: ["application/pdf"] },
                        { name: "Version", values: ["2.0.0"] }
                    ],
                    first: 1000,
                    order: DESC
                    ${cursor ? `, after: "${cursor}"` : ''}
                ) {
                    edges {
                        cursor
                    }
                    pageInfo {
                        hasNextPage
                    }
                }
            }
        `;

        try {
            const response = await fetch('https://uploader.irys.xyz/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const result = await response.json();
            const edges = result.data?.transactions?.edges || [];
            const pageInfo = result.data?.transactions?.pageInfo;

            if (edges.length === 0) {
                hasNextPage = false;
                break;
            }

            const pageCursors = edges.map(edge => edge.cursor);
            allCursors.push(...pageCursors);

            pageCount++;
            const pageDuration = Date.now() - pageStartTime;
            console.log(`✅ Page ${pageCount}: Got ${pageCursors.length} cursors (${pageDuration}ms)`);

            cursor = pageCursors[pageCursors.length - 1];
            hasNextPage = pageInfo?.hasNextPage || false;

        } catch (error) {
            console.error(`❌ Failed to get page ${pageCount + 1}:`, error.message);
            break;
        }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Total: ${allCursors.length} cursors, ${pageCount} pages, ${totalTime}ms`);
    return { allCursors, pageCount, totalTime };
}

// Save cursors to local file
function saveCursorsToFile(allCursors, pageCount) {
    const cursorMap = {};
    
    for (let i = 0; i < allCursors.length; i += 1000) {
        const page = Math.floor(i / 1000) + 1;
        const pageCursors = allCursors.slice(i, i + 1000);
        cursorMap[page] = pageCursors[pageCursors.length - 1];
    }

    fs.writeFileSync('cursor_map.json', JSON.stringify(cursorMap, null, 2), 'utf-8');
    console.log(`✅ Saved ${Object.keys(cursorMap).length} pages to cursor_map.json`);
    
    return cursorMap;
}

// Upload statistics to Irys
async function uploadNewestCursor(allCursors, pageCount) {
    if (allCursors.length < 1) {
        console.log('❌ No cursors found');
        return;
    }

    const irys = await getIrysUploader();
    if (!irys) {
        console.error('❌ Failed to initialize Irys uploader');
        return;
    }

    try {
        const newestCursor = allCursors[0];
        
        const countData = {
            totalPages: pageCount,
            totalCount: allCursors.length,
            latestCursor: newestCursor,
            timestamp: new Date().toISOString(),
        };

        const tags = [
            { name: "App-Name", value: "scivault" },
            { name: "Content-Type", value: "application/json" },
            { name: "Version", value: "2.0.0" },
            { name: "count", value: allCursors.length.toString() },
            { name: "pages", value: pageCount.toString() },
            { name: "type", value: "statistics" }
        ];

        const buffer = Buffer.from(JSON.stringify(countData));
        const receipt = await irys.upload(buffer, { tags });
        
        console.log(`✅ Uploaded to Irys: ${receipt.id}`);
        console.log(`📊 Pages: ${pageCount}, Count: ${allCursors.length}`);
        
        return receipt.id;
    } catch (err) {
        console.error('❌ Upload failed:', err.message);
        throw err;
    }
}

// Main process
(async () => {
    try {
        const { allCursors, pageCount, totalTime } = await fetchAllCursors();
        
        if (allCursors.length === 0) {
            console.log('No PDF transactions found');
            return;
        }

        saveCursorsToFile(allCursors, pageCount);
        
        console.log(`\n📊 Statistics: ${allCursors.length} cursors, ${pageCount} pages, ${totalTime}ms`);
        
        await uploadNewestCursor(allCursors, pageCount);
        
    } catch (error) {
        console.error('❌ Execution failed:', error.message);
    }
})();
