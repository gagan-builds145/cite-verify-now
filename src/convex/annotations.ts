"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { mlAdminRequest, mlServiceConfigured } from "./lib/mlService";
import { ROLES } from "./schema";

async function requireReviewer(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("A signed-in reviewer is required.");
  const user = await ctx.runQuery(internal.adminData.roleForUser, { userId });
  if (!user || (user.role !== ROLES.ADMIN && user.role !== ROLES.REVIEWER)) {
    throw new Error("Reviewer or administrator access is required.");
  }
  const identity = await ctx.auth.getUserIdentity();
  const email = identity?.email?.trim() || user.email?.trim();
  if (!email) throw new Error("A verified reviewer email is required.");
  return { email, name: identity?.name?.trim() || email };
}

async function service<T>(
  ctx: ActionCtx,
  path: string,
  body?: unknown,
  method: "GET" | "POST" = body === undefined ? "GET" : "POST",
): Promise<T> {
  if (!mlServiceConfigured()) {
    throw new Error("CITEVERIFY_ML_URL and CITEVERIFY_ML_TOKEN are not configured.");
  }
  const reviewer = await requireReviewer(ctx);
  const result = await mlAdminRequest<T>(path, body, method, {
    "X-Annotator-Id": reviewer.email,
    "X-Annotator-Name": reviewer.name,
  });
  if (result === null) throw new Error("The annotation service did not return a valid response.");
  return result;
}

function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const stats = action({
  args: {},
  handler: async (ctx) => service<Record<string, unknown>>(ctx, "/admin/annotations/stats"),
});

export const queue = action({
  args: {
    kind: v.optional(v.string()),
    status: v.optional(v.string()),
    paperId: v.optional(v.string()),
    topic: v.optional(v.string()),
    suggestedLabel: v.optional(v.string()),
    reviewer: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    service<Record<string, unknown>>(
      ctx,
      `/admin/annotations/queue${queryString({
        kind: args.kind,
        status: args.status,
        paper_id: args.paperId,
        topic: args.topic,
        suggested_label: args.suggestedLabel,
        reviewer: args.reviewer,
        date_from: args.dateFrom,
        date_to: args.dateTo,
        search: args.search,
        page: args.page,
        page_size: args.pageSize,
      })}`,
    ),
});

export const candidate = action({
  args: { kind: v.string(), exampleId: v.string() },
  handler: async (ctx, args) =>
    service<Record<string, unknown>>(
      ctx,
      `/admin/annotations/candidate/${encodeURIComponent(args.kind)}/${encodeURIComponent(args.exampleId)}`,
    ),
});

export const saveReview = action({
  args: {
    kind: v.string(),
    exampleId: v.string(),
    finalLabel: v.string(),
    reviewStatus: v.string(),
    humanExplanation: v.string(),
    correctionReason: v.string(),
    expectedRevision: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    service<Record<string, unknown>>(ctx, "/admin/annotations/review", {
      kind: args.kind,
      example_id: args.exampleId,
      final_label: args.finalLabel,
      review_status: args.reviewStatus,
      human_explanation: args.humanExplanation,
      correction_reason: args.correctionReason,
      expected_revision: args.expectedRevision,
    }),
});

export const history = action({
  args: { kind: v.string(), exampleId: v.string() },
  handler: async (ctx, args) =>
    service<Array<Record<string, unknown>>>(
      ctx,
      `/admin/annotations/history${queryString({ kind: args.kind, example_id: args.exampleId })}`,
    ),
});

export const readiness = action({
  args: {},
  handler: async (ctx) => service<Record<string, unknown>>(ctx, "/admin/annotations/readiness"),
});

export const reports = action({
  args: {},
  handler: async (ctx) => service<Record<string, unknown>>(ctx, "/admin/annotations/reports", {}),
});

export const exportApproved = action({
  args: {},
  handler: async (ctx) => service<Record<string, unknown>>(ctx, "/admin/annotations/export", {}),
});

export const licenseStats = action({
  args: {},
  handler: async (ctx) => service<Record<string, unknown>>(ctx, "/admin/licenses/stats"),
});

export const licenseQueue = action({
  args: {
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    service<Record<string, unknown>>(
      ctx,
      `/admin/licenses/queue${queryString({
        status: args.status,
        search: args.search,
        page: args.page,
        page_size: args.pageSize,
      })}`,
    ),
});

export const licenseHistory = action({
  args: { paperId: v.string() },
  handler: async (ctx, args) =>
    service<Array<Record<string, unknown>>>(
      ctx,
      `/admin/licenses/history/${encodeURIComponent(args.paperId)}`,
    ),
});

export const saveLicense = action({
  args: {
    paperId: v.string(),
    permissions: v.object({
      store_pdf: v.string(),
      extract_text: v.string(),
      human_annotation: v.string(),
      ml_training: v.string(),
      redistribute_dataset: v.string(),
    }),
    outcome: v.string(),
    rationale: v.string(),
    evidenceUrl: v.string(),
    licenseVersion: v.string(),
    expectedRevision: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    service<Record<string, unknown>>(ctx, "/admin/licenses/review", {
      paper_id: args.paperId,
      permissions: args.permissions,
      outcome: args.outcome,
      rationale: args.rationale,
      evidence_url: args.evidenceUrl,
      license_version: args.licenseVersion,
      expected_revision: args.expectedRevision,
    }),
});
