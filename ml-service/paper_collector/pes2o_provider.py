"""Optional peS2o discovery metadata adapter.

The ODC-By license applies to the database/compilation. It does not grant
blanket rights to every paper's full text, so records from this adapter remain
discovery-only unless an individual source license is verified.
"""

from __future__ import annotations

from typing import Any

from .normalize import clean_text, normalize_doi, stable_paper_id

DATASET = "allenai/peS2o"
DATASET_VERSION = "allenai/peS2o@viewer"
DATASET_LICENSE = "ODC-By 1.0 (database)"
DATASET_LICENSE_URL = "https://opendatacommons.org/licenses/by/1-0/"


def normalize_pes2o_row(row: dict[str, Any], dataset_version: str = DATASET_VERSION) -> dict[str, Any]:
    corpus_id = clean_text(row.get("corpus_id") or row.get("corpusid") or row.get("id"))
    source_collection = clean_text(row.get("source") or row.get("collection") or "s2orc")
    doi = normalize_doi(row.get("doi"))
    title = clean_text(row.get("title"))
    authors = [clean_text(value) for value in row.get("authors") or [] if clean_text(value)]
    return {
        "paper_id": stable_paper_id({"doi": doi, "title": title, "authors": authors}),
        "title": title,
        "authors": authors,
        "abstract": clean_text(row.get("abstract")),
        "doi": doi,
        "semantic_scholar_id": corpus_id,
        "corpus_id": corpus_id,
        "source_collection": source_collection,
        "publication": clean_text(row.get("venue")),
        "publication_year": row.get("year") or 0,
        "publication_date": clean_text(row.get("publication_date")),
        "original_source": "peS2o",
        "source_record_url": clean_text(row.get("url") or f"https://www.semanticscholar.org/paper/{corpus_id}" if corpus_id else ""),
        "download_url": "",
        "filename": "",
        "license": "",
        "license_url": "",
        "dataset_license": DATASET_LICENSE,
        "dataset_license_url": DATASET_LICENSE_URL,
        "dataset_version": dataset_version,
        "open_access_status": "UNKNOWN",
        "reuse_status": "REVIEW_REQUIRED",
        "training_eligibility": False,
        "reuse_basis": "ODC-By covers the database, not necessarily the underlying paper text; original license review required.",
        "provenance": "peS2o discovery metadata; no full corpus or article text downloaded.",
        "paragraphs": [],
        "sources": [{"provider": "pes2o", "record_url": DATASET_LICENSE_URL, "dataset_license": DATASET_LICENSE}],
    }
