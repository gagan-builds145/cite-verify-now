/**
 * Optional server-to-server client for the CiteVerify Python ML service.
 *
 * Every call is best-effort: null means the existing LLM/BM25 path should be
 * used. The service token is read only from the Convex deployment environment.
 */

export type MlPassage = {
  id: string;
  page: number;
  section: string;
  text: string;
  order?: number;
};

export type MlRelevance = {
  label: "RELEVANT" | "PARTIALLY_RELEVANT" | "IRRELEVANT" | "CANNOT_DETERMINE";
  confidence: number;
  probabilities: Record<string, number>;
  confidence_is_calibrated: boolean;
  model_version: string;
};

export type MlEvidenceSelection = {
  source_id: string;
  page?: number;
  section?: string;
  quote?: string;
  relationship: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";
  confidence: number;
};

export type MlEvidence = {
  verdict:
    | "SUPPORTED"
    | "PARTIALLY_SUPPORTED"
    | "CONTRADICTED"
    | "INSUFFICIENT_EVIDENCE"
    | "UNVERIFIED";
  confidence?: number;
  explanation: string;
  evidence: MlEvidenceSelection[];
  limitations: string[];
  human_review_required: boolean;
  model_version?: string;
  probabilities?: Record<string, number>;
};

function configuration(): { base: string; token: string } | null {
  const base = process.env.CITEVERIFY_ML_URL?.trim().replace(/\/+$/, "");
  const token = process.env.CITEVERIFY_ML_TOKEN?.trim();
  return base && token ? { base, token } : null;
}

export function mlServiceConfigured(): boolean {
  return configuration() !== null;
}

async function request<T>(
  path: string,
  body?: unknown,
  options: { method?: "GET" | "POST"; timeoutMs?: number } = {},
): Promise<T | null> {
  const config = configuration();
  if (!config) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const response = await fetch(`${config.base}${path}`, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": config.token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[CiteVerify ML] ${path} returned HTTP ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(
      `[CiteVerify ML] ${path} unavailable: ${error instanceof Error ? error.message : "request failed"}`,
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function mlHealth(): Promise<{
  ok: boolean;
  relevance_model_available: boolean;
  evidence_model_available: boolean;
  active_versions: Record<string, string | null>;
  reranker_enabled: boolean;
} | null> {
  return await request("/health", undefined, { method: "GET", timeoutMs: 2500 });
}

export async function mlRetrieve(input: {
  statement: string;
  passages: MlPassage[];
  topK?: number;
}): Promise<{
  chunks: MlPassage[];
  retrieval_model: string;
  method: string;
} | null> {
  return await request(
    "/retrieve",
    { statement: input.statement, passages: input.passages, top_k: input.topK ?? 12 },
    { timeoutMs: 10000 },
  );
}

export async function mlRelevance(input: {
  statement: string;
  paperTitle: string;
  paperAbstract: string;
  paperKeywords: string[];
}): Promise<MlRelevance | null> {
  return await request(
    "/predict/relevance",
    {
      statement: input.statement,
      paper_title: input.paperTitle,
      paper_abstract: input.paperAbstract,
      paper_keywords: input.paperKeywords,
    },
    { timeoutMs: 6000 },
  );
}

export async function mlEvidence(input: {
  statement: string;
  passages: MlPassage[];
}): Promise<MlEvidence | null> {
  return await request(
    "/predict/evidence",
    { statement: input.statement, passages: input.passages },
    { timeoutMs: 10000 },
  );
}

export async function mlAdminRequest<T>(
  path: string,
  body?: unknown,
  method: "GET" | "POST" = body === undefined ? "GET" : "POST",
): Promise<T | null> {
  return await request(path, body, { method, timeoutMs: 15000 });
}
