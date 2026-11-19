"""PMC Open Access metadata and BioC full-text retrieval.

Only official NCBI endpoints are used. The PMC Open Access category is an
initial review queue classification, never a training permission.
"""

from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import quote_plus

from .config import ALLOWED_API_DOMAINS
from .http import HttpClient
from .licenses import classify_pmc_license
from .normalize import clean_text, normalize_doi, normalize_pmcid, normalize_pmid, stable_paper_id

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
BIOC = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json"
PMC_ARTICLE = "https://pmc.ncbi.nlm.nih.gov/articles"


def _text(node: ET.Element | None) -> str:
    return clean_text(" ".join(node.itertext())) if node is not None else ""


def _attr(node: ET.Element | None, name: str) -> str:
    return clean_text(node.attrib.get(name)) if node is not None else ""


def _license_url(license_text: str, supplied: str) -> str:
    supplied = clean_text(supplied)
    if supplied.startswith(("http://", "https://")):
        return supplied
    embedded = re.search(r"https?://[^\s)<>]+", license_text or "")
    if embedded:
        return embedded.group(0).rstrip(".,;")
    text = license_text.lower().replace("_", " ").replace("-", " ")
    if "cc by nc nd" in text or "cc by-nc-nd" in text:
        return "https://creativecommons.org/licenses/by-nc-nd/4.0/"
    if "cc by nc sa" in text or "cc by-nc-sa" in text:
        return "https://creativecommons.org/licenses/by-nc-sa/4.0/"
    if "cc by nc" in text or "cc by-nc" in text:
        return "https://creativecommons.org/licenses/by-nc/4.0/"
    if "cc by nd" in text or "cc by-nd" in text:
        return "https://creativecommons.org/licenses/by-nd/4.0/"
    if "cc by sa" in text or "cc by-sa" in text:
        return "https://creativecommons.org/licenses/by-sa/4.0/"
    if "cc by" in text or "cc-by" in text:
        return "https://creativecommons.org/licenses/by/4.0/"
    if "cc0" in text or "public domain" in text:
        return "https://creativecommons.org/publicdomain/zero/1.0/"
    return ""


def _authors(article: ET.Element) -> list[str]:
    names = []
    for contrib in article.findall(".//contrib"):
        if contrib.attrib.get("contrib-type") not in {None, "", "author"}:
            continue
        surname = _text(contrib.find(".//surname"))
        given = _text(contrib.find(".//given-names"))
        name = clean_text(f"{given} {surname}") if (given or surname) else _text(contrib.find(".//collab"))
        if name and name not in names:
            names.append(name)
    return names


def _date(article: ET.Element) -> tuple[str, str]:
    for path in (".//pub-date[@pub-type='epub']", ".//pub-date[@pub-type='ppub']", ".//pub-date"):
        node = article.find(path)
        if node is None:
            continue
        year = _text(node.find("year"))
        month = _text(node.find("month")).zfill(2)
        day = _text(node.find("day")).zfill(2)
        if year:
            return year + (f"-{month}" if month else "") + (f"-{day}" if month and day else ""), year
    return "", ""


def parse_pmc_xml(xml: str, pmcid_hint: str = "") -> dict[str, Any]:
    root = ET.fromstring(xml)
    article = root.find(".//article")
    if article is None:
        raise ValueError("PMC EFetch response contained no article.")
    ids = {
        _attr(node, "pub-id-type"): _text(node)
        for node in article.findall(".//article-id")
    }
    pmcid = normalize_pmcid(ids.get("pmcid") or pmcid_hint)
    pmid = normalize_pmid(ids.get("pmid"))
    doi = normalize_doi(ids.get("doi"))
    title = _text(article.find(".//title-group/article-title"))
    abstract = _text(article.find(".//abstract"))
    authors = _authors(article)
    journal = _text(article.find(".//journal-title"))
    pub_date, year = _date(article)
    license_node = article.find(".//permissions/license")
    license_text = _text(license_node)
    license_url = _license_url(license_text, _attr(license_node, "{http://www.w3.org/1999/xlink}href"))
    license_category = classify_pmc_license(license_text, license_url)
    article_type = _attr(article, "article-type")
    version = _text(article.find(".//article-version"))
    retracted = article_type.lower() in {"retraction", "retracted"} or article.find(".//related-article[@link-type='retracted']") is not None
    full_text_url = f"{BIOC}/{pmcid}/unicode" if pmcid else ""
    record_url = f"{PMC_ARTICLE}/{pmcid}/" if pmcid else ""
    record = {
        "paper_id": stable_paper_id({"pmcid": pmcid, "doi": doi, "title": title, "authors": authors}),
        "title": title,
        "authors": authors,
        "abstract": abstract,
        "doi": doi,
        "pmid": pmid,
        "pmcid": pmcid,
        "publication": journal,
        "publication_type": article_type,
        "publication_year": int(year) if year.isdigit() else 0,
        "publication_date": pub_date,
        "is_preprint": False,
        "peer_review_status": "PMC-indexed article; verify venue and article type",
        "research_topics": ["Biomedical Research", "PMC Open Access"],
        "original_source": "PMC Open Access",
        "source_record_url": record_url,
        "full_text_url": full_text_url,
        "download_url": "",
        "filename": "",
        "license": license_text,
        "license_url": license_url,
        "license_category": license_category,
        "dataset_license": "PMC Open Access Subset",
        "dataset_license_url": "https://www.ncbi.nlm.nih.gov/pmc/tools/openftlist/",
        "annotation_license": "",
        "article_version": version,
        "retraction_status": "RETRACTED" if retracted else "NOT_RETRACTED_AS_RECORDED",
        "open_access_status": "open",
        "reuse_status": "REVIEW_REQUIRED",
        "training_eligibility": False,
        "reuse_basis": "PMC Open Access classification is not approval for ML training; an authenticated rights reviewer must decide.",
        "provenance": "Metadata retrieved through NCBI E-utilities EFetch for the PMC Open Access subset.",
        "sources": [{
            "provider": "pmc",
            "record_url": record_url,
            "full_text_url": full_text_url,
            "dataset_license": "PMC Open Access Subset",
        }],
    }
    return record


def _bioc_paragraphs(payload: Any, limit: int = 60) -> list[dict[str, str]]:
    entries = payload if isinstance(payload, list) else []
    documents: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        nested = entry.get("documents")
        if isinstance(nested, list):
            documents.extend(item for item in nested if isinstance(item, dict))
        else:
            documents.append(entry)
    rows: list[dict[str, str]] = []
    for document in documents:
        for passage in document.get("passages") or []:
            text = clean_text(passage.get("text"))
            if len(text) < 80:
                continue
            infons = passage.get("infons") or {}
            rows.append({
                "text": text,
                "section": clean_text(infons.get("section_type") or infons.get("section") or "Body"),
                "xml_path": clean_text(infons.get("xml_path") or infons.get("path") or ""),
                "paragraph_id": clean_text(infons.get("paragraph_id") or passage.get("offset") or ""),
                "page_number": "",
                "page_available": "false",
            })
            if len(rows) >= limit:
                return rows
    return rows


def fetch_pmc_by_ids(
    pmcids: list[str],
    client: HttpClient | None = None,
    paragraphs_per_article: int = 0,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Fetch authoritative metadata for known PMCIDs without a search step."""
    client = client or HttpClient(ALLOWED_API_DOMAINS)
    records: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for raw in pmcids:
        pmcid = normalize_pmcid(raw)
        numeric = pmcid.removeprefix("PMC")
        if not numeric:
            continue
        try:
            xml = client.get_text(f"{EUTILS}/efetch.fcgi?db=pmc&id={numeric}&retmode=xml")
            record = parse_pmc_xml(xml, pmcid)
            if paragraphs_per_article:
                payload = json.loads(client.get_text(f"{BIOC}/{pmcid}/unicode"))
                record["paragraphs"] = _bioc_paragraphs(payload, paragraphs_per_article)
            records.append(record)
        except Exception as error:
            failures.append({"source": "pmc_crossref", "pmcid": pmcid, "error": str(error)})
    return records, failures


def discover_pmc(
    query: str = "open access[filter] AND machine learning",
    limit: int = 20,
    client: HttpClient | None = None,
    date_from: str = "",
    date_to: str = "",
    paragraphs_per_article: int = 60,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    client = client or HttpClient(ALLOWED_API_DOMAINS)
    params = f"db=pmc&term={quote_plus(query)}&retmax={max(1, min(limit * 3, 100))}&retmode=json"
    if date_from:
        params += f"&mindate={date_from}&maxdate={date_to or '3000'}&datetype=pdat"
    search = client.get_json(f"{EUTILS}/esearch.fcgi?{params}")
    ids = [str(value) for value in (search.get("esearchresult") or {}).get("idlist") or []]
    records: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for numeric_id in ids:
        if len(records) >= limit:
            break
        pmcid = normalize_pmcid(numeric_id)
        try:
            xml = client.get_text(f"{EUTILS}/efetch.fcgi?db=pmc&id={numeric_id}&retmode=xml")
            record = parse_pmc_xml(xml, pmcid)
            try:
                payload = None
                last_error: Exception | None = None
                for attempt in range(3):
                    try:
                        payload = json.loads(client.get_text(f"{BIOC}/{pmcid}/unicode"))
                        break
                    except Exception as error:
                        last_error = error
                        if "429" not in str(error):
                            raise
                        time.sleep(2 * (attempt + 1))
                if payload is None and last_error:
                    raise last_error
                record["paragraphs"] = _bioc_paragraphs(payload or [], paragraphs_per_article)
                record["paragraph_source"] = "PMC BioC API"
            except Exception as error:  # metadata remains valid even when text is unavailable
                record["paragraphs"] = []
                record["paragraph_retrieval_error"] = str(error)
                failures.append({"source": "pmc", "pmcid": pmcid, "error": f"BioC unavailable: {error}"})
            records.append(record)
        except Exception as error:  # one bad article must not abort the bounded pilot
            failures.append({"source": "pmc", "pmcid": pmcid, "error": str(error)})
    return records, failures
