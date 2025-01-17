async function getMetadata() {
    try {
        const query = `
            query {
                transactions(
                    tags: [
                        { name: "App-Name", values: ["scivault"] },
                        { name: "Content-Type", values: ["application/json"] },
                        { name: "Version", values: ["0.1.1"] }
                    ],
                    order: DESC
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
        const papers = [];
        
        // 处理每个交易
        for (const edge of result.data?.transactions?.edges || []) {
            const id = edge.node.id;
            const metadataResponse = await fetch(`https://gateway.irys.xyz/${id}`);
            const paper = await metadataResponse.json();
            papers.push(paper);
        }
        
        return papers;

    } catch (error) {
        console.error('Error fetching metadata:', error);
        return null;
    }
}

async function search() {
    const searchType = document.getElementById('searchType').value;
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const resultsDiv = document.getElementById('results');
    
    resultsDiv.innerHTML = '<p>Searching...</p>';
    
    const papers = await getMetadata();
    if (!papers || !Array.isArray(papers)) {
        resultsDiv.innerHTML = '<p>Cannot load paper index</p>';
        return;
    }
    
    const results = papers.filter(paper => {
        if (!paper || typeof paper !== 'object') return false;
        
        switch (searchType) {
            case 'doi':
                return paper.doi?.toLowerCase().includes(searchInput);
            case 'title':
                return paper.title?.toLowerCase().includes(searchInput);
            case 'authors':
                return paper.authors?.toLowerCase().includes(searchInput);
            default:
                return false;
        }
    });
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<p>No matching papers found</p>';
        return;
    }
    
    resultsDiv.innerHTML = results.map(paper => `
        <div class="paper-item">
            <div class="paper-title">${paper.title || 'No title available'}</div>
            <div class="paper-abstract">${paper.abstract || 'No abstract available'}</div>
            <div class="paper-info">Authors: ${paper.authors || 'No authors available'}</div>
            <div class="paper-info">DOI: ${paper.doi || 'No DOI available'}</div>
            <div class="paper-info">arXiv ID: ${paper.aid || 'No arXiv ID available'}</div>
        </div>
    `).join('');
} 