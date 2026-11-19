"""Scholarly metadata providers used for discovery.

Providers return normalized candidate records. No provider is trusted to grant
reuse rights; the license checker must assess each record separately.
"""

from __future__ import annotations

import html
import os
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import quote_plus

from .config import ALLOWED_API_DOMAINS
from .http import HttpClient, HttpError
from .normalize import (
    clean_text,
    normalize_arxiv_id,
    normalize_doi,
    normalize_pmcid,
    normalize_pmid,
    normalize_record,
    stable_paper_id,
)


def _source(provider: str, record_url: str, download_url: str = "") -> dict[str, str]:
    return {"provider": provider, "record_url": record_url, "download_url": download_url}


def _record(**values: Any) -> dict[str, Any]:
    return normalize_record(values)


def _topics(values: list[str], requested: str) -> list[str]:
    return list(dict.fromkeys([requested, *[clean_text(value) for value in values if clean_text(value)]]))


def _arxiv_entry(entry: ET.Element, topic: str) -> dict[str, Any]:
    ns = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
    raw_id = clean_text(entry.findtext("a:id", default="", namespaces=ns))
    arxiv_id = normalize_arxiv_id(raw_id)
    title = clean_text(entry.findtext("a:title", default="", namespaces=ns))
    abstract = clean_text(entry.findtext("a:summary", default="", namespaces=ns))
    authors = [
        clean_text(author.findtext("a:name", default="", namespaces=ns))
        for author in entry.findall("a:author", ns)
    ]
    published = clean_text(entry.findtext("a:published", default="", namespaces=ns))
    updated = clean_text(entry.findtext("a:updated", default="", namespaces=ns))
    categories = [node.attrib.get("term", "") for node in entry.findall("a:category", ns) if node.attrib.get("term")]
    doi = clean_text(entry.findtext("arxiv:doi", default="", namespaces=ns))
    journal = clean_text(entry.findtext("arxiv:journal_ref", default="", namespaces=ns))
    pdf_url = ""
    for link in entry.findall("a:link", ns):
        if link.attrib.get("title") == "pdf" or link.attrib.get("type") == "application/pdf":
            pdf_url = link.attrib.get("href", "")
    if not pdf_url and arxiv_id:
        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
    record_url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else raw_id
    record = _record(
        paper_id=stable_paper_id({"arxiv_id": arxiv_id, "title": title, "authors": authors}),
        title=title,
        authors=authors,
        abstract=abstract,
        doi=normalize_doi(doi),
        arxiv_id=arxiv_id,
        publication=journal or "arXiv preprint",
        publication_type="preprint",
        publication_year=published[:4],
        publication_date=published[:10],
        is_preprint=True,
        peer_review_status="Preprint; peer review not verified",
        research_topics=_topics(categories, topic),
        original_source="arXiv",
        source_record_url=record_url,
        download_url=pdf_url,
        open_access_status="open",
        provenance=f"Discovered through the official arXiv API for topic {topic}; metadata and version date {updated or published}.",
        sources=[_source("arxiv", record_url, pdf_url)],
    )
    return record


def discover_arxiv(topic: str, limit: int = 5, client: HttpClient | None = None) -> list[dict[str, Any]]:
    client = client or HttpClient(ALLOWED_API_DOMAINS)
    query = quote_plus(f'all:"{topic}"')
    url = (
        "https://export.arxiv.org/api/query?"
        f"search_query={query}&start=0&max_results={max(1, min(limit, 50))}"
        "&sortBy=submittedDate&sortOrder=descending"
    )
    try:
        text = client.get_text(url)
    except HttpError as error:
        # arXiv sometimes rate-limits HTTPS API requests while the official
        # plain-HTTP endpoint remains available. Never use an unauthorized mirror.
        if "429" not in str(error):
            raise
        text = client.get_text(url.replace("https://export.arxiv.org", "http://export.arxiv.org", 1))
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise HttpError(f"arXiv returned invalid Atom XML: {error}") from error
    return [_arxiv_entry(entry, topic) for entry in root.findall("{http://www.w3.org/2005/Atom}entry")]


def _openalex_abstract(index: dict[str, list[int]] | None) -> str:
    if not index:
        return ""
    words: dict[int, str] = {}
    for word, positions in index.items():
        for position in positions or []:
            if isinstance(position, int):
                words[position] = word
    return " ".join(words[position] for position in sorted(words))


def _openalex_record(work: dict[str, Any], topic: str) -> dict[str, Any]:
    best = work.get("best_oa_location") or {}
    primary = work.get("primary_location") or {}
    open_access = work.get("open_access") or {}
    doi = normalize_doi(work.get("doi"))
    authors = [
        clean_text((item.get("author") or {}).get("display_name"))
        for item in work.get("authorships") or []
        if clean_text((item.get("author") or {}).get("display_name"))
    ]
    landing = clean_text(best.get("landing_page_url") or primary.get("landing_page_url") or work.get("id"))
    pdf_url = clean_text(best.get("pdf_url"))
    license_name = clean_text(best.get("license") or primary.get("license"))
    license_url = clean_text(best.get("license_url") or primary.get("license_url"))
    record_url = clean_text(work.get("id")) or landing
    return _record(
        paper_id=stable_paper_id({"doi": doi, "title": work.get("title"), "authors": authors}),
        title=work.get("title"),
        authors=authors,
        abstract=_openalex_abstract(work.get("abstract_inverted_index")),
        doi=doi,
        publication=clean_text((primary.get("source") or {}).get("display_name")),
        publication_type=clean_text(work.get("type")),
        publication_year=work.get("publication_year"),
        publication_date=work.get("publication_date"),
        is_preprint=str(work.get("type", "")).lower() == "preprint",
        peer_review_status="Unknown from OpenAlex metadata" if str(work.get("type", "")).lower() != "preprint" else "Preprint",
        research_topics=_topics(
            [
                value.get("display_name") or value.get("id") if isinstance(value, dict) else str(value)
                for value in (work.get("topics") or [])
                if value
            ],
            topic,
        ),
        original_source="OpenAlex",
        source_record_url=record_url,
        download_url=pdf_url,
        license=license_name,
        license_url=license_url,
        open_access_status=clean_text(open_access.get("oa_status")) or "UNKNOWN",
        provenance=f"Discovered through the official OpenAlex API for topic {topic}; full-text URL supplied by OpenAlex.",
        sources=[_source("openalex", record_url, pdf_url)],
    )


def discover_openalex(topic: str, limit: int = 5, client: HttpClient | None = None) -> list[dict[str, Any]]:
    client = client or HttpClient(ALLOWED_API_DOMAINS)
    url = (
        "https://api.openalex.org/works?"
        f"search={quote_plus(topic)}&filter=has_fulltext:true,is_oa:true&per-page={max(1, min(limit, 50))}"
    )
    mailto = os.environ.get("CITEVERIFY_OPENALEX_MAILTO", "").strip()
    if mailto:
        url += f"&mailto={quote_plus(mailto)}"
    payload = client.get_json(url)
    return [_openalex_record(work, topic) for work in payload.get("results", []) if isinstance(work, dict)]


def _semantic_record(paper: dict[str, Any], topic: str) -> dict[str, Any]:
    external = paper.get("externalIds") or {}
    open_pdf = paper.get("openAccessPdf") or {}
    doi = normalize_doi(external.get("DOI"))
    arxiv_id = normalize_arxiv_id(external.get("ArXiv"))
    authors = [clean_text(author.get("name")) for author in paper.get("authors") or [] if clean_text(author.get("name"))]
    pdf_url = clean_text(open_pdf.get("url"))
    record_url = clean_text(paper.get("url")) or (f"https://www.semanticscholar.org/paper/{paper.get('paperId')}" if paper.get("paperId") else "")
    return _record(
        paper_id=stable_paper_id({"doi": doi, "arxiv_id": arxiv_id, "title": paper.get("title"), "authors": authors}),
        title=paper.get("title"),
        authors=authors,
        abstract=paper.get("abstract"),
        doi=doi,
        arxiv_id=arxiv_id,
        semantic_scholar_id=clean_text(paper.get("paperId")),
        publication=paper.get("venue") or "",
        publication_type=", ".join(paper.get("publicationTypes") or []),
        publication_year=paper.get("year"),
        publication_date=paper.get("publicationDate"),
        is_preprint="preprint" in " ".join(paper.get("publicationTypes") or []).lower(),
        peer_review_status="Unknown from Semantic Scholar metadata",
        research_topics=_topics([], topic),
        original_source="Semantic Scholar",
        source_record_url=record_url,
        download_url=pdf_url if paper.get("isOpenAccess") else "",
        open_access_status="open" if paper.get("isOpenAccess") else "closed",
        provenance=f"Discovered through the Semantic Scholar Academic Graph API for topic {topic}.",
        sources=[_source("semantic_scholar", record_url, pdf_url if paper.get("isOpenAccess") else "")],
    )


def discover_semantic_scholar(
    topic: str,
    limit: int = 5,
    client: HttpClient | None = None,
    api_key: str = "",
) -> list[dict[str, Any]]:
    api_key = api_key or os.environ.get("CITEVERIFY_SEMANTIC_SCHOLAR_API_KEY", "").strip()
    client = client or HttpClient(
        ALLOWED_API_DOMAINS,
        headers={"x-api-key": api_key} if api_key else None,
    )
    fields = "paperId,title,abstract,authors,year,venue,publicationDate,externalIds,openAccessPdf,isOpenAccess,publicationTypes"
    url = (
        "https://api.semanticscholar.org/graph/v1/paper/search?"
        f"query={quote_plus(topic)}&limit={max(1, min(limit, 100))}&fields={fields}"
    )
    # The current HttpClient intentionally exposes no arbitrary headers. Use a
    # keyed client only in deployment by setting the key in the API gateway; the
    # unauthenticated endpoint remains functional with rate limiting.
    payload = client.get_json(url)
    return [_semantic_record(paper, topic) for paper in payload.get("data", []) if isinstance(paper, dict)]


def _europe_pmc_record(item: dict[str, Any], topic: str) -> dict[str, Any]:
    full_text = item.get("fullTextUrlList") or {}
    urls = full_text.get("fullTextUrl") if isinstance(full_text, dict) else []
    pdf_url = ""
    for entry in urls or []:
        if str(entry.get("documentStyle", "")).lower() == "pdf" and entry.get("url"):
            pdf_url = clean_text(entry["url"])
            break
    journal = (item.get("journalInfo") or {}).get("journal") or {}
    authors = []
    author_string = clean_text(item.get("authorString"))
    if author_string:
        authors = [part.strip() for part in author_string.split(",") if part.strip()]
    pmcid = normalize_pmcid(item.get("pmcid"))
    record_url = f"https://europepmc.org/article/PMC/{pmcid}" if pmcid else clean_text(item.get("id"))
    return _record(
        paper_id=stable_paper_id({"doi": item.get("doi"), "pmcid": pmcid, "pmid": item.get("pmid"), "title": item.get("title"), "authors": authors}),
        title=item.get("title"),
        authors=authors,
        abstract=item.get("abstractText"),
        doi=normalize_doi(item.get("doi")),
        pmid=normalize_pmid(item.get("pmid")),
        pmcid=pmcid,
        publication=clean_text(journal.get("title")),
        publication_type=clean_text(item.get("pubType")),
        publication_year=item.get("pubYear"),
        publication_date=item.get("firstPublicationDate"),
        is_preprint="preprint" in clean_text(item.get("pubType")).lower(),
        peer_review_status="Open-access biomedical record; verify venue separately",
        research_topics=_topics([], topic),
        original_source="Europe PMC",
        source_record_url=record_url,
        download_url=pdf_url,
        license=clean_text(item.get("license")),
        open_access_status="open" if str(item.get("isOpenAccess", "")).upper() == "Y" else "UNKNOWN",
        provenance=f"Discovered through the official Europe PMC REST API for topic {topic}; open-access status from the record.",
        sources=[_source("europe_pmc", record_url, pdf_url)],
    )


def discover_europe_pmc(topic: str, limit: int = 5, client: HttpClient | None = None) -> list[dict[str, Any]]:
    client = client or HttpClient(ALLOWED_API_DOMAINS)
    url = (
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search?"
        f"query={quote_plus(topic)}%20AND%20OPEN_ACCESS:Y&format=json&resultType=core&pageSize={max(1, min(limit, 25))}"
    )
    payload = client.get_json(url)
    results = (payload.get("resultList") or {}).get("result") or []
    return [_europe_pmc_record(item, topic) for item in results if isinstance(item, dict)]


def _crossref_record(item: dict[str, Any], topic: str) -> dict[str, Any]:
    title = (item.get("title") or [""])[0]
    authors = []
    for author in item.get("author") or []:
        value = " ".join(part for part in (author.get("given"), author.get("family")) if part)
        if value:
            authors.append(clean_text(value))
    date_parts = (item.get("published-print") or item.get("published-online") or item.get("issued") or {}).get("date-parts") or [[]]
    year = date_parts[0][0] if date_parts and date_parts[0] else ""
    licenses = item.get("license") or []
    license_entry = licenses[0] if licenses else {}
    doi = normalize_doi(item.get("DOI"))
    record_url = clean_text(item.get("URL")) or (f"https://doi.org/{doi}" if doi else "")
    return _record(
        paper_id=stable_paper_id({"doi": doi, "title": title, "authors": authors}),
        title=title,
        authors=authors,
        abstract=html.unescape(re.sub(r"<[^>]+>", " ", clean_text(item.get("abstract")))),
        doi=doi,
        publication=clean_text((item.get("container-title") or [""])[0]),
        publication_type=clean_text(item.get("type")),
        publication_year=year,
        publication_date="-".join(str(value) for value in (date_parts[0] or [])),
        is_preprint=clean_text(item.get("type")).lower() == "posted-content",
        peer_review_status="Bibliographic record only; peer review not verified",
        research_topics=_topics([], topic),
        original_source="Crossref",
        source_record_url=record_url,
        download_url="",
        license=clean_text(license_entry.get("URL")),
        license_url=clean_text(license_entry.get("URL")),
        open_access_status="UNKNOWN",
        provenance=f"Discovered through Crossref metadata for topic {topic}; Crossref does not grant full-text access.",
        sources=[_source("crossref", record_url)],
    )


def discover_crossref(topic: str, limit: int = 5, client: HttpClient | None = None) -> list[dict[str, Any]]:
    client = client or HttpClient(ALLOWED_API_DOMAINS)
    url = (
        "https://api.crossref.org/works?"
        f"query={quote_plus(topic)}&rows={max(1, min(limit, 50))}&select=DOI,title,author,abstract,container-title,type,published-print,published-online,issued,license,URL"
    )
    payload = client.get_json(url)
    items = ((payload.get("message") or {}).get("items")) or []
    return [_crossref_record(item, topic) for item in items if isinstance(item, dict)]


PROVIDERS = {
    "arxiv": discover_arxiv,
    "openalex": discover_openalex,
    "semantic_scholar": discover_semantic_scholar,
    "europe_pmc": discover_europe_pmc,
    "crossref": discover_crossref,
}
