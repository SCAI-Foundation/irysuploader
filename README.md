# SciVault

A decentralized academic paper repository system built on Arweave/Irys.

## Prerequisites

1. Node.js (v16 or higher)
2. Solana wallet with SOL tokens
3. Create a `.env` file with your Solana private key:
   ```
   PRIVATE_KEY=your_solana_private_key_here
   ```

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/scivault.git
   cd scivault
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Step 0: Prepare Your Data

1. Create a `metadata` folder in the project root
2. Place your metadata JSON files and corresponding PDFs in this folder
   - Each PDF should have a matching JSON file with the same name (e.g., `paper1.pdf` and `paper1.json`)
   - JSON files must contain a `doi` field
3. Run the metadata generator:
   ```bash
   node 0_generate_basic_metadata.js
   ```
   This will create a `basic_metadata.json` file containing essential paper information.

### Step 1: Upload Basic Metadata

Upload the basic metadata (title, authors, DOI, etc.):
```bash
node 1_upload_basic_metadata.js
```

### Step 2: Upload PDFs

Upload PDFs (they will be automatically split into chunks):
```bash
node 2_upload_pdf.js
```

Note: If uploads fail due to network issues, you can safely run the script again. It will skip already uploaded files and continue with failed ones.

### Step 3: Upload Complete Metadata

Upload the complete metadata with all paper details:
```bash
node 3_upload_all_metadata.js
```

## Version Control

The system uses semantic versioning for content management:
- Current version: `1.0.3`
- Format: `MAJOR.MINOR.PATCH`
  - MAJOR: Breaking changes
  - MINOR: New features
  - PATCH: Bug fixes

When uploading content, ensure you're using the correct version in the tags.

## Error Handling

- Each upload script generates detailed logs:
  - `upload_report.json`: Summary of upload results
  - `upload_errors.json`: Details of failed uploads
- Failed uploads can be retried by running the script again
- The system checks for existing uploads to avoid duplicates

## Web Interface

The `queryweb` folder contains a simple web interface for searching and viewing papers:
- Search by DOI, title, or arXiv ID
- View paper metadata
- Download PDF files

## License

MIT