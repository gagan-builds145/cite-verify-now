"""Configuration for the CiteVerify paper collector."""

from __future__ import annotations

from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
DATASETS_DIR = PACKAGE_ROOT / "datasets"
SOURCE_DIR = DATASETS_DIR / "source_papers"
EXTRACTED_DIR = DATASETS_DIR / "extracted"
RAW_DIR = DATASETS_DIR / "raw"
REPORTS_DIR = DATASETS_DIR / "reports"
CACHE_DIR = DATASETS_DIR / "cache" / "discovery"
EXTERNAL_DIR = DATASETS_DIR / "external"
EXTERNAL_RECORDS_PATH = EXTERNAL_DIR / "records.jsonl"
EXTERNAL_RELEVANCE_PATH = EXTERNAL_DIR / "candidates_relevance.csv"
EXTERNAL_EVIDENCE_PATH = EXTERNAL_DIR / "candidates_evidence.jsonl"
EXTERNAL_STATE_PATH = EXTERNAL_DIR / "state.json"
EXTERNAL_REPORTS_DIR = REPORTS_DIR
RECORDS_PATH = DATASETS_DIR / "paper_records.jsonl"
STATE_PATH = DATASETS_DIR / "collection_state.json"
METADATA_CSV = SOURCE_DIR / "metadata.csv"
MANIFEST_JSON = DATASETS_DIR / "source_manifest.json"

DEFAULT_TOPICS = (
    "Artificial Intelligence",
    "Machine Learning",
    "Natural Language Processing",
    "Deep Learning",
    "Information Retrieval",
    "Scientific Research Verification",
    "Fact Checking",
    "Textual Entailment",
    "Citation Analysis",
    "Research Paper Recommendation",
    "Biomedical Research",
    "Computer Science",
)

DEFAULT_TARGET = 25
MAX_PDF_BYTES = 50 * 1024 * 1024
MIN_PDF_BYTES = 8 * 1024
REQUEST_TIMEOUT = 25.0
REQUEST_DELAY_SECONDS = 1.0
USER_AGENT = "CiteVerifyPaperCollector/1.0 (research dataset collection; contact: project owner)"

# Official/open-access repositories and publishers whose open PDFs may be used.
# A final URL must remain in this set after redirects. Extend deliberately.
ALLOWED_PDF_DOMAINS = frozenset(
    {
        "arxiv.org",
        "www.arxiv.org",
        "export.arxiv.org",
        "aclanthology.org",
        "www.aclweb.org",
        "europepmc.org",
        "www.europepmc.org",
        "ebi.ac.uk",
        "www.ebi.ac.uk",
        "ncbi.nlm.nih.gov",
        "pmc.ncbi.nlm.nih.gov",
        "openreview.net",
        "proceedings.mlr.press",
        "jmlr.org",
        "openaccess.thecvf.com",
        "www.nature.com",
        "nature.com",
        "link.springer.com",
        "www.frontiersin.org",
        "frontiersin.org",
        "journals.plos.org",
        "plos.org",
        "biomedcentral.com",
        "www.biomedcentral.com",
        "mdpi.com",
        "www.mdpi.com",
    }
)

ALLOWED_API_DOMAINS = frozenset(
    {
        "export.arxiv.org",
        "arxiv.org",
        "api.openalex.org",
        "api.semanticscholar.org",
        "www.ebi.ac.uk",
        "api.crossref.org",
        "doi.org",
        "api.datacite.org",
        "eutils.ncbi.nlm.nih.gov",
        "www.ncbi.nlm.nih.gov",
        "pmc.ncbi.nlm.nih.gov",
        "ftp.ncbi.nlm.nih.gov",
        "datasets-server.huggingface.co",
        "huggingface.co",
        "creativecommons.org",
    }
)

METADATA_COLUMNS = (
    "original_filename",
    "title",
    "authors",
    "year",
    "doi",
    "doi_verified",
    "source_url",
    "publication",
    "license",
    "license_url",
    "provenance",
    "paper_id",
    "arxiv_id",
    "pmid",
    "pmcid",
    "semantic_scholar_id",
    "openalex_id",
    "publication_type",
    "is_preprint",
    "peer_review_status",
    "research_topics",
    "original_source",
    "download_url",
    "file_size_bytes",
    "sha256",
    "open_access_status",
    "reuse_status",
    "training_eligibility",
    "download_timestamp",
    "pdf_validation_status",
    "page_count",
    "extraction_status",
)

RECORD_FIELDS = (
    "paper_id",
    "title",
    "authors",
    "abstract",
    "doi",
    "doi_verified",
    "arxiv_id",
    "pmid",
    "pmcid",
    "semantic_scholar_id",
    "openalex_id",
    "publication",
    "publication_type",
    "publication_year",
    "publication_date",
    "is_preprint",
    "peer_review_status",
    "research_topics",
    "original_source",
    "source_record_url",
    "download_url",
    "filename",
    "file_size_bytes",
    "sha256",
    "license",
    "license_url",
    "open_access_status",
    "reuse_status",
    "training_eligibility",
    "download_timestamp",
    "pdf_validation_status",
    "page_count",
    "extraction_status",
    "provenance",
    "sources",
)
