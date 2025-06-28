# 📄 SciUploader – Bulk Sci-Hub PDF Downloader

This tool automates the batch download of academic papers from Sci-Hub using DOIs and organizes the PDFs for further metadata processing and decentralized storage Irys.

---

## 📦 Project Structure

```
sciuploader/
├── doi/                            ← Each page_N.json contains a list of DOIs
├── pdf/                            ← Downloaded PDFs organized by page
├── 0_run_workflow.js              ← Run full workflow script
├── 1_fetch_all_dois.js            ← Fetch DOI list from external source
├── 2_fetch_all_pdfs.js            ← Download PDFs using DOI list
├── 3_generate_basic_metadata.js   ← Generate basic metadata JSON
├── 4_upload_all_basic_metadata.js ← Upload metadata to decentralized storage (TBD)
├── 5_upload_all_pdfs.js           ← Upload PDFs to decentralized storage (TBD)
├── 9_fund.js                      ← Funding registration or helper functions
├── .env.example                   ← Example environment configuration
└── README.md                      ← This file
```

---


## add run_uploader.sh to run the workflow
```bash
./run_uploader.sh --start-page=300000 --end-page=400000
```


## ✅ How to Use

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables (optional)

Copy `.env.example` to `.env` and fill in any required values (e.g., upload keys for later stages).

---

### 3. Run full workflow

```bash
node 0_run_workflow.js
```

for dividing tasks,
add --start-page=3 --end-page=4 like this, there are total 883431 pages

```bash
node 0_run_workflow.js --start-page=300000 --end-page=400000
```


Or run step-by-step:

---

### ◾️ Step 1: Fetch all DOIs (optional)

```bash
node 1_fetch_all_dois.js
```

This fetches DOIs from an API and saves them into `doi/page_N.json` files.

---

### ◾️ Step 2: Download all PDFs

```bash
node 2_fetch_all_pdfs.js --start-page=1 --end-page=10
```

- Failed downloads are logged to `failed_log_page_N.txt` per page.
- Already downloaded and valid files are skipped.

---

### ◾️ Step 3: Generate basic metadata

```bash
node 3_generate_basic_metadata.js
```

---

### ◾️ Step 4 & 5: Upload

```bash
node 4_upload_all_basic_metadata.js
node 5_upload_all_pdfs.js
```
---

## 📜 License

MIT
