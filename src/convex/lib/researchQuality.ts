import { normalizeForMatch, normalizeWhitespace } from "./text";
import { normalizeDoi, titleIdentitySimilarity } from "./academic";

export type FreshnessStatus =
  | "CURRENT"
  | "NEWER_EVIDENCE_AVAILABLE"
  | "POSSIBLY_OUTDATED"
  | "SUPERSEDED"
  | "RETRACTED"
  | "CORRECTED"
  | "FRESHNESS_UNKNOWN";

export type PublicationStatus =
  | "ACTIVE"
  | "CORRECTED"
  | "RETRACTED"
  | "EXPRESSION_OF_CONCERN"
  | "WITHDRAWN"
  | "STATUS_UNKNOWN";

export type CoverageLevel =
  | "FULL_TEXT_REVIEWED"
  | "ABSTRACT_ONLY"
  | "METADATA_ONLY"
  | "FULL_TEXT_UNAVAILABLE"
  | "EXTRACTION_INCOMPLETE";

export type ExtractionQuality = "HIGH" | "MEDIUM" | "LOW" | "FAILED";

export type NewerEvidence = {
  title: string;
  year?: number;
  doi?: string;
  url?: string;
  type?: string;
  abstract?: string;
  source: string;
  isRetracted?: boolean;
};

export type FreshnessAssessment = {
  status: FreshnessStatus;
  newer?: NewerEvidence;
  comparison: string;
  provider: string;
};

function overlap(text: string, terms: Set<string>): number {
  const tokens = normalizeForMatch(text)
    .split(" ")
    .filter((token) => token.length > 3);
  if (tokens.length === 0 || terms.size === 0) return 0;
  let shared = 0;
  for (const token of new Set(tokens)) if (terms.has(token)) shared += 1;
  return shared / Math.min(terms.size, 16);
}

export function assessFreshness(input: {
  originalTitle: string;
  originalYear?: number;
  claimText: string;
  integrityStatus?: PublicationStatus;
  newer: NewerEvidence[];
}): FreshnessAssessment {
  if (input.integrityStatus === "RETRACTED") {
    return {
      status: "RETRACTED",
      comparison:
        "The cited publication has a retraction notice. Its evidential use requires human review; the original verdict is preserved.",
      provider: "Publication integrity check",
    };
  }
  if (input.integrityStatus === "CORRECTED") {
    return {
      status: "CORRECTED",
      comparison:
        "A correction notice is associated with the cited publication. Check whether the corrected content affects this claim.",
      provider: "Publication integrity check",
    };
  }
  if (!input.originalYear) {
    return {
      status: "FRESHNESS_UNKNOWN",
      comparison:
        "The original publication year is unavailable, so a newer-evidence comparison cannot be dated reliably.",
      provider: "OpenAlex",
    };
  }

  const claimTerms = new Set(
    normalizeForMatch(input.claimText)
      .split(" ")
      .filter((token) => token.length > 4),
  );
  const relevant = input.newer
    .filter((record) => !record.isRetracted)
    .filter((record) => (record.year ?? 0) > (input.originalYear ?? 0))
    .filter((record) => {
      const titleScore = titleIdentitySimilarity(input.originalTitle, record.title);
      const abstractScore = record.abstract ? overlap(record.abstract, claimTerms) : 0;
      return titleScore >= 0.58 || abstractScore >= 0.24;
    })
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  if (relevant.length === 0) {
    return {
      status: "CURRENT",
      comparison:
        "No newer publication in the searched OpenAlex result set was sufficiently related to the citation and claim. Publication age alone was not treated as evidence of invalidity.",
      provider: "OpenAlex",
    };
  }

  const best = relevant[0];
  const reviewLike = /systematic review|meta-analysis|guideline|consensus statement/i.test(
    `${best.type ?? ""} ${best.title}`,
  );
  const titleScore = titleIdentitySimilarity(input.originalTitle, best.title);
  const status: FreshnessStatus =
    reviewLike && titleScore >= 0.55 ? "POSSIBLY_OUTDATED" : "NEWER_EVIDENCE_AVAILABLE";

  return {
    status,
    newer: best,
    comparison:
      `${best.source} returned a newer related publication (${best.year ?? "year unavailable"}). ` +
      `Title identity with the cited work is ${Math.round(titleScore * 100)}%. ` +
      "This is a relevance signal only; it does not establish that the newer work confirms, contradicts or supersedes the claim. Human review is required.",
    provider: best.source,
  };
}

function reconstructAbstract(index?: Record<string, number[]>): string | undefined {
  if (!index) return undefined;
  const entries: [number, string][] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) entries.push([position, word]);
  }
  if (entries.length === 0) return undefined;
  entries.sort((a, b) => a[0] - b[0]);
  return normalizeWhitespace(entries.map(([, word]) => word).join(" ")).slice(0, 2500);
}

type OpenAlexNewerWork = {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  type?: string;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { landing_page_url?: string; source?: { display_name?: string } };
  abstract_inverted_index?: Record<string, number[]>;
  is_retracted?: boolean;
};

export async function searchNewerEvidence(input: {
  originalTitle: string;
  originalYear?: number;
  claimText: string;
}): Promise<{ records: NewerEvidence[]; ok: boolean }> {
  if (!input.originalYear) return { records: [], ok: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const query = normalizeWhitespace(
      `${input.originalTitle} ${input.claimText}`.slice(0, 320),
    );
    const url =
      `https://api.openalex.org/works?search=${encodeURIComponent(query)}` +
      `&filter=from_publication_date:${input.originalYear + 1}-01-01` +
      "&per-page=6&select=id,doi,title,display_name,publication_year,type,authorships,primary_location,abstract_inverted_index,is_retracted";
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CiteVerify/1.0 (evidence freshness check)",
        Accept: "application/json",
      },
    });
    if (!response.ok) return { records: [], ok: false };
    const payload = (await response.json()) as { results?: OpenAlexNewerWork[] };
    const records: NewerEvidence[] = (payload.results ?? [])
      .map((work): NewerEvidence | null => {
        const title = normalizeWhitespace(work.title ?? work.display_name ?? "");
        if (!title) return null;
        const doi = work.doi?.replace(/^https?:\/\/doi\.org\//i, "");
        return {
          title,
          year: work.publication_year,
          doi,
          url: doi ? `https://doi.org/${doi}` : work.primary_location?.landing_page_url ?? work.id,
          type: work.type,
          abstract: reconstructAbstract(work.abstract_inverted_index),
          source: "OpenAlex",
          isRetracted: work.is_retracted === true,
        };
      })
      .filter((record): record is NewerEvidence => record !== null);
    return { records, ok: true };
  } catch {
    return { records: [], ok: false };
  } finally {
    clearTimeout(timer);
  }
}

type CrossrefNotice = {
  DOI?: string;
  title?: string[];
  type?: string;
  published?: { "date-parts"?: number[][] };
  URL?: string;
  "update-to"?: { DOI?: string; type?: string }[];
  relation?: Record<string, { id?: string; "id-type"?: string }[]>;
};

export type IntegrityAssessment = {
  status: PublicationStatus;
  source: string;
  checkedAt: number;
  noticeTitle?: string;
  noticeDoi?: string;
  noticeDate?: string;
  noticeUrl?: string;
  note: string;
};

export async function checkPublicationIntegrity(input: {
  title: string;
  doi?: string;
  year?: number;
  publisher?: string;
  isRetracted?: boolean;
  retractionNote?: string;
  retractionUrl?: string;
}): Promise<IntegrityAssessment> {
  const checkedAt = Date.now();
  if (input.isRetracted) {
    return {
      status: "RETRACTED",
      source: "OpenAlex",
      checkedAt,
      noticeTitle: "Retraction flag",
      noticeUrl: input.retractionUrl,
      note: input.retractionNote ?? "OpenAlex marks this publication as retracted.",
    };
  }
  const titleStatus = /^retracted\s*[:-]/i.test(input.title.trim())
    ? "RETRACTED"
    : /^expression of concern\s*[:-]/i.test(input.title.trim())
      ? "EXPRESSION_OF_CONCERN"
      : /^withdrawn\s*[:-]/i.test(input.title.trim())
        ? "WITHDRAWN"
        : /^corrected\s*[:-]/i.test(input.title.trim())
          ? "CORRECTED"
          : undefined;
  if (titleStatus) {
    return {
      status: titleStatus,
      source: "Crossref title metadata",
      checkedAt,
      noticeTitle: input.title,
      noticeUrl: input.doi ? `https://doi.org/${normalizeDoi(input.doi) ?? input.doi}` : undefined,
      note: "The publication title itself carries a retraction, correction, concern or withdrawal marker. Preserve the original verdict and review affected claims.",
    };
  }
  if (!input.doi) {
    return {
      status: "STATUS_UNKNOWN",
      source: "No DOI",
      checkedAt,
      note: "No DOI was available, so a notice lookup could not be completed. Missing metadata is not proof of validity.",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const doi = normalizeDoi(input.doi);
    if (!doi) throw new Error("invalid doi");
    const response = await fetch(
      `https://api.crossref.org/works?filter=relation.object:${encodeURIComponent(doi)}&rows=10&select=DOI,title,type,published,URL,update-to,relation`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "CiteVerify/1.0 (publication integrity check)",
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) throw new Error("crossref unavailable");
    const payload = (await response.json()) as {
      message?: { items?: CrossrefNotice[] };
    };
    const notices = payload.message?.items ?? [];
    const matching = notices.find((item) => {
      const type = (item.type ?? "").toLowerCase();
      const updateTypes = (item["update-to"] ?? []).map((entry) => (entry.type ?? "").toLowerCase());
      const relationTypes = Object.keys(item.relation ?? {}).map((key) => key.toLowerCase());
      const mentionsDoi = (item["update-to"] ?? []).some(
        (entry) => normalizeDoi(entry.DOI) === doi,
      );
      return (
        mentionsDoi ||
        relationTypes.some((key) => /retract|correct|concern|withdraw/.test(key)) ||
        updateTypes.some((key) => /retract|correct|concern|withdraw/.test(key)) ||
        /retraction|correction|expression of concern|withdrawal/.test(type)
      );
    });
    if (matching) {
      const type = `${matching.type ?? ""} ${(matching["update-to"] ?? [])
        .map((entry) => entry.type ?? "")
        .join(" ")} ${Object.keys(matching.relation ?? {}).join(" ")}`.toLowerCase();
      const status: PublicationStatus = /retract/.test(type)
        ? "RETRACTED"
        : /withdraw/.test(type)
          ? "WITHDRAWN"
          : /concern/.test(type)
            ? "EXPRESSION_OF_CONCERN"
            : "CORRECTED";
      const dateParts = matching.published?.["date-parts"]?.[0] ?? [];
      return {
        status,
        source: "Crossref notice lookup",
        checkedAt,
        noticeTitle: matching.title?.[0],
        noticeDoi: matching.DOI,
        noticeDate: dateParts.length > 0 ? dateParts.join("-") : undefined,
        noticeUrl: matching.URL ?? (matching.DOI ? `https://doi.org/${matching.DOI}` : undefined),
        note: "A Crossref notice record matched the cited DOI. Preserve the original verdict and review affected claims.",
      };
    }
    return {
      status: "ACTIVE",
      source: "Crossref notice lookup",
      checkedAt,
      note: "Crossref returned no matching retraction, correction, concern or withdrawal notice at this check time. Absence of a notice is not proof of validity.",
    };
  } catch {
    return {
      status: "STATUS_UNKNOWN",
      source: "Crossref notice lookup",
      checkedAt,
      note: "The publication-integrity lookup could not be completed. No status conclusion was drawn.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function coverageFor(
  retrievalLevel: "full_text" | "abstract" | "metadata_only" | "unavailable",
  extractionQuality?: ExtractionQuality,
): { coverageLevel: CoverageLevel; sourceType: string; limitation?: string } {
  if (extractionQuality === "LOW" || extractionQuality === "FAILED") {
    return {
      coverageLevel: "EXTRACTION_INCOMPLETE",
      sourceType: "Local PDF extraction",
      limitation:
        "The document extraction quality was low or failed. Quotations and citation identity require review against the source PDF.",
    };
  }
  if (retrievalLevel === "full_text") {
    return { coverageLevel: "FULL_TEXT_REVIEWED", sourceType: "Open-access full text" };
  }
  if (retrievalLevel === "abstract") {
    return {
      coverageLevel: "ABSTRACT_ONLY",
      sourceType: "Abstract",
      limitation:
        "Only the abstract was available for this reference. The evidence verdict is limited to abstract-level review.",
    };
  }
  if (retrievalLevel === "metadata_only") {
    return {
      coverageLevel: "METADATA_ONLY",
      sourceType: "Bibliographic metadata",
      limitation:
        "Only bibliographic metadata was available. No claim-level evidence text was reviewed.",
    };
  }
  return {
    coverageLevel: "FULL_TEXT_UNAVAILABLE",
    sourceType: "No source text",
    limitation:
      "No full text or abstract was available for this reference. The claim could not receive full-text verification.",
  };
}
