// fetch_latest_cursors.js - 增量获取新cursor并上传统计信息
require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');

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

// 1. 获取上次统计的 latestCursor 和 totalPages
async function getLastStats() {
    const query = `
        query {
            transactions(
                tags: [
                    { name: "App-Name", values: ["scivault"] },
                    { name: "Content-Type", values: ["application/json"] },
                    { name: "Version", values: ["2.0.0"] },
                    { name: "type", values: ["statistics"] }
                ],
                first: 1,
                order: DESC
            ) {
                edges {
                    node { id }
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
        if (edges.length === 0) return { latestCursor: null, totalPages: 0, totalCount: 0 };
        const statsId = edges[0].node.id;
        const url = `https://gateway.irys.xyz/${statsId}`;
        const res = await fetch(url);
        const json = await res.json();
        return {
            latestCursor: json.root?.latestCursor || json.latestCursor || null,
            totalPages: json.root?.totalPages || json.totalPages || 0,
            totalCount: json.root?.totalCount || json.totalCount || 0
        };
    } catch (error) {
        console.error('❌ 获取上次统计信息失败:', error.message);
        return { latestCursor: null, totalPages: 0, totalCount: 0 };
    }
}

// 2. 从上次cursor开始查找是否有新的一页
async function fetchNewCursor(lastCursor) {
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
                ${lastCursor ? `, after: "${lastCursor}"` : ''}
            ) {
                edges {
                    cursor
                }
            }
        }
    `;
    const response = await fetch('https://uploader.irys.xyz/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const result = await response.json();
    const edges = result.data?.transactions?.edges || [];
    if (edges.length === 0) return null;
    // 返回新一页的最后一个cursor
    return edges[edges.length - 1]?.cursor || null;
}

// 3. 上传新的统计信息到Irys
async function uploadCountToIrys(totalPages, totalCount, latestCursor) {
    const irys = await getIrysUploader();
    if (!irys) {
        console.error('❌ 无法初始化Irys uploader');
        return;
    }
    try {
        const countData = {
            totalPages: totalPages,
            totalCount: totalCount,
            latestCursor: latestCursor,
            timestamp: new Date().toISOString(),
        };
        const tags = [
            { name: "App-Name", value: "scivault" },
            { name: "Content-Type", value: "application/json" },
            { name: "Version", value: "2.0.0" },
            { name: "count", value: totalCount.toString() },
            { name: "pages", value: totalPages.toString() },
            { name: "type", value: "statistics" }
        ];
        const buffer = Buffer.from(JSON.stringify(countData));
        const receipt = await irys.upload(buffer, { tags });
        console.log(`✅ 已上传统计信息到Irys: ${receipt.id}`);
        console.log(`📊 总页数: ${totalPages}, 总数: ${totalCount}`);
        console.log(`📌 latestCursor(上一页): ${latestCursor}`);
        return receipt.id;
    } catch (err) {
        console.error('❌ 上传统计信息失败:', err.message);
        throw err;
    }
}

// 4. 主流程
(async () => {
    const { latestCursor, totalPages, totalCount } = await getLastStats();
    console.log(`上次统计: 页数=${totalPages}, 总数=${totalCount}, latestCursor=${latestCursor}`);
    const newCursor = await fetchNewCursor(latestCursor);
    if (!newCursor || newCursor === latestCursor) {
        console.log('没有新的一页，无需更新。');
        return;
    }
    // 追加到本地cursor_map.json
    let cursorMap = {};
    try {
        if (fs.existsSync('cursor_map.json')) {
            cursorMap = JSON.parse(fs.readFileSync('cursor_map.json', 'utf-8'));
        }
    } catch {}
    const newPage = totalPages + 1;
    cursorMap[newPage] = newCursor;
    fs.writeFileSync('cursor_map.json', JSON.stringify(cursorMap, null, 2), 'utf-8');
    // 上传新统计（关键：用上一页的cursor，且只有有新页才上传）
    const prevCursor = cursorMap[newPage - 1] || null;
    if (!prevCursor || prevCursor === newCursor) {
        console.log('没有新的一页（上一页cursor和新页cursor相同），无需上传统计。');
        return;
    }
    await uploadCountToIrys(newPage, newPage * 1000, prevCursor);
})();
