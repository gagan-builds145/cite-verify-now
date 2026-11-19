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

- Use the publisher's or author's permitted copy.
- Do not rename files to imply a different paper.
- Do not add fabricated PDFs.
- A scanned PDF with no selectable text is reported as unreadable; OCR is not
  performed automatically.
- If metadata is absent, leave it absent. The extractor does not invent title,
  authors, year, DOI, page numbers or quotations.
- Re-running extraction is resumable. `--force` requires an explicit re-extract
  and backs up the previous per-paper JSON first.
