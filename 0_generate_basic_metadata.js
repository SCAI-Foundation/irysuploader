const fs = require('fs').promises;
const path = require('path');

async function walkDir(dir) {
    try {
        const files = await fs.readdir(dir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        return jsonFiles.map(file => path.join(dir, file));
    } catch (error) {
        console.error('Error reading directory:', error);
        throw error;
    }
}

function extractAbstract(paper) {
    // Try to reconstruct abstract from inverted index if available
    if (paper.openalex?.abstract_inverted_index) {
        const words = [];
        const index = paper.openalex.abstract_inverted_index;
        const maxPosition = Math.max(...Object.values(index).flat());
        
        for (let i = 0; i <= maxPosition; i++) {
            for (const [word, positions] of Object.entries(index)) {
                if (positions.includes(i)) {
                    words[i] = word;
                    break;
                }
            }
        }
        return words.join(' ');
    }
    return ""; // Return empty string if no abstract found
}

function extractBasicMetadata(paper) {
    return {
        abstract: extractAbstract(paper),
        title: paper.openalex?.title || 
               paper.crossref?.title?.[0] || 
               "",
        authors: paper.openalex?.authorships
            ?.map(a => a.raw_author_name)
            .join(", ") ||
            paper.crossref?.author
            ?.map(a => `${a.given} ${a.family}`)
            .join(", ") ||
            "",
        doi: paper.doi || "",
        aid: paper.openalex?.id?.split("/").pop() || 
             paper.crossref?.DOI?.replace(/[^a-zA-Z0-9]/g, "") || 
             ""
    };
}

async function generateBasicMetadata(metadataDir) {
    try {
        // Get all JSON files in the directory
        const files = await walkDir(metadataDir);
        
        // Process each file
        const metadata = [];
        for (const file of files) {
            try {
                console.log(`Processing file: ${file}`);  // Add logging
                const content = await fs.readFile(file, 'utf8');
                const paper = JSON.parse(content.trim());  // Add trim() to remove any BOM or whitespace
                
                const basicMetadata = extractBasicMetadata(paper);
                metadata.push(basicMetadata);
            } catch (error) {
                console.error(`Error processing file ${file}:`, error);
                // Continue with next file instead of stopping
                continue;
            }
        }

        // Write the results to a file
        const outputPath = path.join(process.cwd(), 'basic_metadata.json');
        await fs.writeFile(
            outputPath, 
            JSON.stringify(metadata, null, 2)
        );

        console.log(`Basic metadata generated and saved to ${outputPath}`);
        console.log(`Processed ${metadata.length} files successfully`);
        return metadata;
    } catch (error) {
        console.error('Error generating basic metadata:', error);
        throw error;
    }
}

// Export the function if using as a module
module.exports = generateBasicMetadata;

// If running directly
if (require.main === module) {
    const metadataDir = process.argv[2] || path.join(process.cwd(), 'metadata');
    generateBasicMetadata(metadataDir).catch(console.error);
}
