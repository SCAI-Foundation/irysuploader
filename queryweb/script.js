async function getMetadataAndPdf() {
    try {
        const searchType = document.getElementById('searchType').value;
        const searchInput = document.getElementById('searchInput').value;
        
        // 第一步：搜索 metadata
        const query = `
            query {
                transactions(
                    tags: [
                        { name: "App-Name", values: ["scivault"] },
                        { name: "Content-Type", values: ["application/json"] },
                        { name: "Version", values: ["1.0.3"] },
                        { name: "${searchType}", values: ["${searchInput}"] }
                    ],
                    first: 100
                ) {
                    edges {
                        node {
                            id
                            tags {
                                name
                                value
                            }
                        }
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
        const metadataNodes = result.data?.transactions?.edges || [];
        
        // 第二步：从 metadata 中提取所有 DOI
        const dois = metadataNodes.map(edge => 
            edge.node.tags.find(tag => tag.name === 'doi')?.value
        ).filter(doi => doi);

        // 第三步：用 DOI 查询对应的 PDF（包括分片上传的）
        const pdfMap = new Map();
        if (dois.length > 0) {
            const pdfQuery = `
                query {
                    transactions(
                        tags: [
                            { name: "Content-Type", values: ["application/pdf"] },
                            { name: "application", values: ["scivault"] },
                            { name: "Version", values: ["1.0.3"] },
                            { name: "Type", values: ["pdf-index"] },
                            { name: "Collection", values: ${JSON.stringify(dois)} }
                        ],
                        first: 100
                    ) {
                        edges {
                            node {
                                id
                                tags {
                                    name
                                    value
                                }
                            }
                        }
                    }
                }
            `;

            const pdfResponse = await fetch('https://uploader.irys.xyz/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: pdfQuery })
            });

            const pdfResult = await pdfResponse.json();
            
            // 将所有分片的 ID 存入 Map，以 DOI 为键
            for (const edge of pdfResult.data?.transactions?.edges || []) {
                const tags = edge.node.tags;
                const collection = tags.find(tag => tag.name === 'Collection')?.value;
                if (collection) {
                    // 如果这个 DOI 已经有分片，添加到数组中
                    if (pdfMap.has(collection)) {
                        pdfMap.get(collection).push(edge.node.id);
                    } else {
                        pdfMap.set(collection, [edge.node.id]);
                    }
                }
            }
        }

        // 第四步：处理元数据并关联 PDF
        const papers = [];
        for (const edge of metadataNodes) {
            const id = edge.node.id;
            const metadataResponse = await fetch(`https://gateway.irys.xyz/${id}`);
            const paper = await metadataResponse.json();
            const doi = edge.node.tags.find(tag => tag.name === 'doi')?.value;
            paper.pdfIds = pdfMap.get(doi) || null; // 存储所有分片的 ID
            papers.push(paper);
        }
        
        return papers;
    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

async function search() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<p>Searching...</p>';
    
    const papers = await getMetadataAndPdf();
    if (!papers || !Array.isArray(papers)) {
        resultsDiv.innerHTML = '<p>Cannot load paper index</p>';
        return;
    }
    
    if (papers.length === 0) {
        resultsDiv.innerHTML = '<p>No matching papers found</p>';
        return;
    }
    
    resultsDiv.innerHTML = papers.map(paper => `
        <div class="paper-item">
            <div class="paper-title">${paper.title || 'No title available'}</div>
            <div class="paper-info">DOI: ${paper.doi || 'No DOI available'}</div>
            <div class="paper-info">arXiv ID: ${paper.aid || 'No arXiv ID available'}</div>
            <div class="paper-info">Transaction ID: ${paper.id || 'No TX ID available'}</div>
            <div class="paper-authors">Authors: ${paper.authors || 'No authors available'}</div>
            <div class="paper-abstract">
                <strong>Abstract:</strong><br>
                ${paper.abstract || 'No abstract available'}
            </div>
            <div class="paper-actions">
                <div class="button-group">
                    ${paper.pdfIds 
                        ? `<button class="pdf-button available" onclick='mergePdfAndView("${encodeURIComponent(paper.doi)}", ${JSON.stringify(paper.pdfIds)})'>View PDF</button>`
                        : `<button class="pdf-button disabled" disabled>PDF Not Available</button>`
                    }
                    <button class="metadata-button" onclick='viewMetadata("${encodeURIComponent(paper.doi)}")'>View Metadata</button>
                </div>
            </div>
        </div>
    `).join('');
} 

async function mergePdfAndView(encodedDoi, pdfIds) {
    try {
        const doi = decodeURIComponent(encodedDoi);
        // 获取所有分片的内容
        const pdfChunks = await Promise.all(
            pdfIds.map(id => 
                fetch(`https://gateway.irys.xyz/${id}`)
                    .then(res => res.text())
            )
        );
        
        // 合并所有分片
        const mergedBase64 = pdfChunks.join('');
        
        // 使用 base64 解码替代 Buffer
        const binaryString = atob(mergedBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // 创建 Blob 并生成 URL
        const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        const pdfUrl = URL.createObjectURL(pdfBlob);
        
        // 在新窗口中打开 PDF
        window.open(pdfUrl, '_blank');
    } catch (error) {
        console.error('Error merging PDF:', error);
        alert('Failed to load PDF. Please try again later.');
    }
} 

// 添加查看完整元数据的函数
async function viewMetadata(encodedDoi) {
    try {
        const doi = decodeURIComponent(encodedDoi);
        
        // 查询完整元数据
        const query = `
            query {
                transactions(
                    tags: [
                        { name: "Content-Type", values: ["metadata/json"] },
                        { name: "App-Name", values: ["scivault"] },
                        { name: "Version", values: ["0.2.1"] },
                        { name: "doi", values: ["${doi}"] }
                    ],
                    first: 1
                ) {
                    edges {
                        node {
                            id
                        }
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
        const metadataId = result.data?.transactions?.edges?.[0]?.node?.id;

        if (!metadataId) {
            throw new Error('Metadata not found');
        }

        // 获取完整元数据
        const metadataResponse = await fetch(`https://gateway.irys.xyz/${metadataId}`);
        const metadata = await metadataResponse.json();

        // 在新窗口中显示纯文本格式的 JSON
        const metadataWindow = window.open('', '_blank');
        metadataWindow.document.write(`
            <html>
                <head>
                    <title>Paper Metadata</title>
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            background: white;
                        }
                        pre {
                            margin: 0;
                            padding: 16px;
                            font-family: monospace;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                        }
                    </style>
                </head>
                <body><pre>${JSON.stringify(metadata, null, 2)}</pre></body>
            </html>
        `);
    } catch (error) {
        console.error('Error viewing metadata:', error);
        alert('Failed to load metadata. Please try again later.');
    }
} 