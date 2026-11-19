import { v } from "convex/values";
import { mutation } from "./_generated/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const submit = mutation({
  args: {
    email: v.string(),
    topic: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim();
    const message = args.message.trim();
    if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address.");
    if (message.length < 20) throw new Error("Please include at least a sentence of context.");
    if (message.length > 4000) throw new Error("Please keep the message under 4000 characters.");
    if (!["accuracy", "privacy", "deployment", "product"].includes(args.topic)) {
      throw new Error("Choose a valid topic.");
    }

    await ctx.db.insert("contactMessages", {
      email: email.slice(0, 200),
      topic: args.topic,
      message: message.slice(0, 4000),
    });
    return { received: true };
  },
});
