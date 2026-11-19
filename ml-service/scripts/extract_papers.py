#!/usr/bin/env python3
"""Extract supplied PDFs sequentially into inspectable per-paper JSON.

The script never downloads papers, invents metadata, or executes PDF content.
If a PDF is scanned/image-only it is marked unreadable rather than receiving
fabricated text. Re-running with the same PDF is resumable and uses a stable
content hash as the paper id.
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import read_json, write_json  # noqa: E402
from common.pdf_extract import extract_pdf  # noqa: E402

MANIFEST_FIELDS = (
    "original_filename",
    "paper_id",
    "title",
    "authors",
    "year",
    "doi",
    "doi_verified",
    "source_url",
    "publication",
    "license",
    "license_url",
    "extraction_status",
    "page_count",
    "total_text_chars",
    "successful_pages",
    "empty_pages",
    "page_errors",
    "extraction_limitations",
    "source_sha256",
    "extracted_file",
    "provenance",
    "metadata_source",
    "extracted_at",
)


def backup(path: Path) -> None:
    if not path.exists():
        return
    stamp = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, path.with_name(f"{path.name}.bak-{stamp}"))


def manifest_entry(paper: dict[str, Any], extracted_file: str) -> dict[str, Any]:
    return {
        "original_filename": paper.get("source_file", ""),
        "paper_id": paper.get("paper_id", ""),
        "title": paper.get("title", ""),
        "authors": paper.get("authors", []),
        "year": paper.get("year"),
        "doi": paper.get("doi", ""),
        "doi_verified": bool(paper.get("doi_verified", False)),
        "source_url": paper.get("source_url", ""),
        "publication": paper.get("publication", ""),
        "license": paper.get("license", ""),
        "license_url": paper.get("license_url", ""),
        "extraction_status": paper.get("extraction_status", ""),
        "page_count": paper.get("page_count", 0),
        "total_text_chars": paper.get("total_text_chars", 0),
        "successful_pages": paper.get("successful_pages", []),
        "empty_pages": paper.get("empty_pages", []),
        "page_errors": paper.get("page_errors", []),
        "extraction_limitations": paper.get("limitations", []),
        "source_sha256": paper.get("source_sha256", ""),
        "extracted_file": extracted_file,
        "provenance": paper.get("provenance", ""),
        "metadata_source": paper.get("metadata_source", ""),
        "extracted_at": paper.get("extracted_at", ""),
    }


def load_sidecar_metadata(source_dir: Path) -> dict[str, dict[str, str]]:
    """Read optional user-supplied metadata.csv; never infer missing values."""
    path = source_dir / "metadata.csv"
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return {
            str(row.get("original_filename", "")).strip(): row
            for row in csv.DictReader(handle)
            if str(row.get("original_filename", "")).strip()
        }


def apply_sidecar(paper: dict[str, Any], metadata: dict[str, str]) -> None:
    if not metadata:
        return
    boolean = str(metadata.get("doi_verified", "")).strip().lower() in {"1", "true", "yes", "y"}
    if metadata.get("title", "").strip():
        paper["title"] = metadata["title"].strip()
    if metadata.get("authors", "").strip():
        paper["authors"] = [
            value.strip() for value in re.split(r";", metadata["authors"])
            if value.strip()
        ]
    if metadata.get("year", "").strip().isdigit():
        paper["year"] = int(metadata["year"].strip())
    if metadata.get("doi", "").strip():
        paper["doi"] = metadata["doi"].strip()
    paper["doi_verified"] = boolean
    for key in ("source_url", "publication", "license", "license_url", "provenance"):
        if metadata.get(key, "").strip():
            paper[key] = metadata[key].strip()
    paper["metadata_source"] = "sidecar_metadata_csv"
    limitations = list(paper.get("limitations", []))
    if paper.get("title"):
        limitations = [value for value in limitations if not value.startswith("Title could not")]
    if paper.get("authors"):
        limitations = [value for value in limitations if not value.startswith("Author names could not")]
    if paper.get("year"):
        limitations = [value for value in limitations if not value.startswith("Publication year could not")]
    if paper.get("doi"):
        limitations = [value for value in limitations if not value.startswith("DOI was not present")]
    paper["limitations"] = limitations


def write_manifest(
    manifest: dict[str, Any], json_path: Path, csv_path: Path, backup_existing: bool = True
) -> None:
    if backup_existing:
        backup(json_path)
    write_json(json_path, manifest)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        for paper in manifest.get("papers", []):
            row = {key: paper.get(key, "") for key in MANIFEST_FIELDS}
            for key in ("authors", "successful_pages", "empty_pages", "page_errors", "extraction_limitations"):
                row[key] = " | ".join(str(value) for value in row[key] or [])
            writer.writerow(row)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / "datasets" / "source_papers")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "datasets" / "extracted")
    parser.add_argument("--manifest-json", type=Path, default=ROOT / "datasets" / "source_manifest.json")
    parser.add_argument("--manifest-csv", type=Path, default=ROOT / "datasets" / "source_manifest.csv")
    parser.add_argument("--force", action="store_true", help="Re-extract PDFs and back up old JSON")
    parser.add_argument("--limit", type=int, default=0, help="Process at most N PDFs; 0 means all")
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    output_dir = args.output_dir.resolve()
    source_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(
        (path for path in source_dir.iterdir() if path.is_file() and path.suffix.lower() == ".pdf"),
        key=lambda path: path.name.lower(),
    )
    sidecar = load_sidecar_metadata(source_dir)
    if args.limit > 0:
        pdfs = pdfs[:args.limit]

    manifest: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": int(time.time()),
        "source_dir": str(source_dir),
        "paper_count": 0,
        "status": "ready",
        "papers": [],
        "errors": [],
        "notice": "Only metadata and text actually present in the supplied PDFs is recorded. Missing fields remain empty.",
    }

    if not pdfs:
        manifest["status"] = "no_source_pdfs"
        manifest["notice"] = (
            "No PDFs were found in datasets/source_papers. Add genuine papers and run this script again. "
            "No dataset rows or quotations were generated."
        )
        write_manifest(manifest, args.manifest_json, args.manifest_csv)
        print("No PDFs found. Add genuine research-paper PDFs to:", source_dir)
        return 0

    backup(args.manifest_json)
    write_manifest(manifest, args.manifest_json, args.manifest_csv, backup_existing=False)

    seen_hashes: dict[str, str] = {}
    for path in pdfs:
        paper_id = None
        try:
            from common.pdf_extract import paper_id_for, source_sha256

            digest = source_sha256(path)
            if digest in seen_hashes:
                manifest["errors"].append({
                    "original_filename": path.name,
                    "status": "duplicate",
                    "error": f"Same bytes as {seen_hashes[digest]}; not extracted twice.",
                })
                continue
            paper_id = paper_id_for(path)
            target = output_dir / f"{paper_id}.json"
            if target.exists() and not args.force:
                cached = read_json(target, {})
                if cached:
                    manifest["papers"].append(manifest_entry(cached, str(target)))
                    seen_hashes[digest] = path.name
                    print(f"cached  {path.name} -> {paper_id}")
                    continue
            if target.exists() and args.force:
                backup_dir = output_dir / ".backup"
                backup_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup_dir / f"{paper_id}-{time.strftime('%Y%m%d-%H%M%S')}.json")
            paper = extract_pdf(path)
            paper["paper_id"] = paper_id
            apply_sidecar(paper, sidecar.get(path.name, {}))
            write_json(target, paper)
            manifest["papers"].append(manifest_entry(paper, str(target)))
            seen_hashes[digest] = path.name
            print(f"extracted {path.name} -> {paper_id} ({paper['extraction_status']})")
        except Exception as error:  # noqa: BLE001 - report a bad PDF without stopping the batch
            manifest["errors"].append({
                "original_filename": path.name,
                "paper_id": paper_id,
                "status": "failed",
                "error": str(error),
            })
            print(f"failed  {path.name}: {error}", file=sys.stderr)
        finally:
            manifest["paper_count"] = len(manifest["papers"])
            write_manifest(manifest, args.manifest_json, args.manifest_csv, backup_existing=False)

    manifest["paper_count"] = len(manifest["papers"])
    if not manifest["papers"] and manifest["errors"]:
        manifest["status"] = "all_extractions_failed"
    elif manifest["errors"]:
        manifest["status"] = "complete_with_errors"
    write_manifest(manifest, args.manifest_json, args.manifest_csv, backup_existing=False)
    print(f"Processed {manifest['paper_count']} paper(s); {len(manifest['errors'])} extraction error(s).")
    return 0 if manifest["papers"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
