const fs = require('fs');
const path = require('path');
const axios = require('axios');

// === Configuration ===
const PDF_BASE_DIR = './pdf';
const OPENALEX_BASE_URL = 'https://api.openalex.org/works/doi:';
const DELAY_MS = 1500;

// === CLI Argument Parser ===
const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = args.find(arg => arg.startsWith(prefix));
  return found ? parseInt(found.slice(prefix.length), 10) : undefined;
};
const cliStart = getArg("start-page");
const cliEnd = getArg("end-page");

// === Utilities ===
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Convert inverted index to plain abstract text
const parseAbstract = (index) => {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    positions.forEach(pos => {
      words[pos] = word;
    });
  }
  return words.join(' ');
};

// Extract only essential metadata fields
const extractMetadata = (data) => {
  const title = data.title || data.display_name || '';
  const authors = (data.authorships || [])
    .map(a => a.author?.display_name)
    .filter(Boolean)
    .join(', ');
  const abstract = parseAbstract(data.abstract_inverted_index);
  const doi = data.doi?.replace('https://doi.org/', '') || '';
  const aid = data.id?.replace('https://openalex.org/', '') || '';
  return { title, authors, abstract, doi, aid };
};

// Process all PDFs in a single page folder
async function generateMetadataForPage(pageDir) {
  const pageNum = pageDir.match(/\d+/)[0];
  console.log(`\n📁 Processing folder: page_${pageNum}`);

  const pdfFiles = fs.readdirSync(pageDir).filter(f => f.endsWith('.pdf'));
  const metadataList = [];

  for (const file of pdfFiles) {
    const doiEncoded = file.replace(/\.pdf$/, '');
    const doi = decodeURIComponent(doiEncoded);
    const openalexUrl = `${OPENALEX_BASE_URL}${doi}`;

    try {
      console.log(`🔍 Fetching metadata for DOI: ${doi}`);
      const response = await axios.get(openalexUrl);
      const metadata = extractMetadata(response.data);
      metadataList.push(metadata);
    } catch (error) {
      console.warn(`⚠️ Failed to fetch metadata for ${doi}: ${error.message}`);
    }

    await sleep(DELAY_MS);
  }

  const outputPath = path.join(pageDir, 'basic_metadata.json');
  fs.writeFileSync(outputPath, JSON.stringify(metadataList, null, 2));
  console.log(`✅ Saved metadata to ${outputPath}`);
}

// === Main Function ===
async function main() {
  const subdirs = fs.readdirSync(PDF_BASE_DIR)
    .filter(d => d.startsWith('page_'))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]))
    .filter(d => {
      const page = parseInt(d.match(/\d+/)[0], 10);
      if (cliStart && page < cliStart) return false;
      if (cliEnd && page > cliEnd) return false;
      return true;
    })
    .map(d => path.join(PDF_BASE_DIR, d))
    .filter(d => fs.statSync(d).isDirectory());

  for (const pageDir of subdirs) {
    await generateMetadataForPage(pageDir);
  }

  console.log('\n🎉 Metadata generation completed for all selected folders.');
}

main();
