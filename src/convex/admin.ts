"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { mlAdminRequest, mlHealth, mlServiceConfigured } from "./lib/mlService";
import { ROLES } from "./schema";

async function requireAdmin(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("A session is required.");
  const user = await ctx.runQuery(internal.adminData.roleForUser, { userId });
  if (!user || user.role !== ROLES.ADMIN) {
    throw new Error("Administrator access is required.");
  }
}

async function service<T>(path: string, body?: unknown): Promise<T> {
  if (!mlServiceConfigured()) {
    throw new Error("CITEVERIFY_ML_URL and CITEVERIFY_ML_TOKEN are not configured.");
  }
  const result = await mlAdminRequest<T>(path, body);
  if (result === null) throw new Error("The ML service did not return a valid response.");
  return result;
}

export const health = action({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await mlHealth();
  },
});

export const status = action({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await service<Record<string, unknown>>("/admin/status");
  },
});

export const uploadDataset = action({
  args: {
    name: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.content.length > 900_000) {
      throw new Error(
        "Dataset uploads through the dashboard are limited to 900 KB. Use the ml-service CLI for larger files.",
      );
    }
    return await service<Record<string, unknown>>("/admin/datasets/upload", {
      name: args.name,
      content: args.content,
    });
  },
});

export const validateDataset = action({
  args: {
    kind: v.union(v.literal("relevance"), v.literal("evidence")),
    file: v.string(),
    allowUnreviewed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await service<Record<string, unknown>>("/admin/validate", {
      kind: args.kind,
      file: args.file,
      allow_unreviewed: args.allowUnreviewed ?? false,
    });
  },
});

export const trainModel = action({
  args: {
    kind: v.union(v.literal("relevance"), v.literal("evidence")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await service<Record<string, unknown>>("/admin/train", { kind: args.kind });
  },
});

export const evaluateModel = action({
  args: {
    kind: v.union(v.literal("relevance"), v.literal("evidence")),
    modelVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await service<Record<string, unknown>>("/admin/evaluate", {
      kind: args.kind,
      model_version: args.modelVersion || null,
    });
  },
});

export const jobStatus = action({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await service<Record<string, unknown>>(`/admin/jobs/${encodeURIComponent(args.jobId)}`);
  },
});

export const deployModel = action({
  args: {
    kind: v.union(v.literal("relevance"), v.literal("evidence")),
    version: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await service<Record<string, unknown>>("/admin/deploy", {
      kind: args.kind,
      version: args.version,
    });
  },
});

export const rollbackModel = action({
  args: { kind: v.union(v.literal("relevance"), v.literal("evidence")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await service<Record<string, unknown>>("/admin/rollback", { kind: args.kind });
  },
});
