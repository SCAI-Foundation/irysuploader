// simple-stats.js - 极简统计：通过统计data文件获取cursor再分页统计
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// 1. 查询最新统计信息，获取交易id
async function getLatestStatsId() {
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
                    node {
                        id
                    }
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
        if (edges.length === 0) {
            console.log('❌ 没有找到任何统计信息');
            return null;
        }
        return edges[0].node.id;
    } catch (error) {
        console.error('❌ 获取统计信息失败:', error.message);
        return null;
    }
}

// 2. 通过id下载data文件，获取latestCursor和totalCount
async function getLatestStatsFromData(statsId) {
    try {
        const url = `https://gateway.irys.xyz/${statsId}`;
        const res = await fetch(url);
        const json = await res.json();
        // 支持 root.latestCursor 或直接 latestCursor
        const latestCursor = json.root?.latestCursor || json.latestCursor;
        const totalCount = json.root?.totalCount || json.totalCount || 0;
        if (!latestCursor) {
            console.log('❌ data文件中没有latestCursor');
            return null;
        }
        return { latestCursor, totalCount };
    } catch (error) {
        console.error('❌ 下载或解析data文件失败:', error.message);
        return null;
    }
}

// 3. 从cursor开始分页统计，返回新增数量
async function statFromCursor(startCursor) {
    console.log(`📊 从cursor开始统计Version 2.0.0 PDF...`);
    let allDois = new Set();
    let cursor = startCursor;
    let pageCount = 0;
    let totalFiles = 0;
    while (pageCount < 50) {
        pageCount++;
        console.log(`📖 查询第 ${pageCount} 页...`);
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
                        node {
                            id
                            tags { name value }
                        }
                        cursor
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
            if (edges.length === 0) {
                console.log(`✅ 没有更多数据`);
                break;
            }
            edges.forEach(edge => {
                const doi = edge.node.tags.find(tag => tag.name === 'doi')?.value;
                if (doi) allDois.add(doi);
            });
            totalFiles += edges.length;
            cursor = edges[edges.length - 1]?.cursor;
            console.log(`📄 本页 ${edges.length} 个文件, 累计唯一DOI: ${allDois.size}`);
            if (!cursor || edges.length < 100) break;
        } catch (err) {
            console.error('❌ 查询出错:', err.message);
            break;
        }
    }
    console.log(`\n🎉 查询完成！`);
    console.log(`📁 新增唯一 DOI 数量: ${allDois.size}`);
    console.log(`📄 新增文件数: ${totalFiles}`);
    return { newDois: allDois.size, newFiles: totalFiles };
}

// 主入口
(async () => {
    const statsId = await getLatestStatsId();
    if (!statsId) {
        console.error('❌ 无法获取统计信息id，退出');
        process.exit(1);
    }
    const stats = await getLatestStatsFromData(statsId);
    if (!stats) {
        console.error('❌ 无法获取起始cursor，退出');
        process.exit(1);
    }
    const { latestCursor, totalCount } = stats;
    const { newDois, newFiles } = await statFromCursor(latestCursor);
    const sum = totalCount + newFiles;
    console.log('\n==============================');
    console.log(`历史总数: ${totalCount}`);
    console.log(`本次新增: ${newFiles}`);
    console.log(`累计总数: ${sum}`);
    console.log('==============================');
})(); 