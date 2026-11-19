# Source papers

Place genuine, legally obtained research-paper PDFs in this directory, then run:

```powershell
cd ml-service
python scripts\extract_papers.py
```

The extractor reads PDFs sequentially, preserves page numbers and section
labels, and writes one inspectable JSON file per paper under
`datasets/extracted/`. PDFs are ignored by git and are never uploaded or
executed.

If you have verifiable source information, copy `metadata_template.csv` to
`metadata.csv` and fill one row per original filename. Supply only values you
can verify:

```text
original_filename,title,authors,year,doi,doi_verified,source_url,publication,license,license_url,provenance
```

`doi_verified=true` means you checked the DOI at its resolver. Leave it false
otherwise. `source_url`, `publication`, `license` and `license_url` are recorded
verbatim; they are never inferred. If `metadata.csv` is absent, the extractor
uses embedded PDF metadata and first-page text only.

- Use the publisher's or author's permitted copy.
- Do not rename files to imply a different paper.
- Do not add fabricated PDFs.
- A scanned PDF with no selectable text is reported as unreadable; OCR is not
  performed automatically.
- If metadata is absent, leave it absent. The extractor does not invent title,
  authors, year, DOI, page numbers or quotations.
- Re-running extraction is resumable. `--force` requires an explicit re-extract
  and backs up the previous per-paper JSON first.
