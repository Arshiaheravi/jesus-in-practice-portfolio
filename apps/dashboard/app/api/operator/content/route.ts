import { contentAiConfigFromEnv, ContentDrafter } from "@jesus-in-practice/backend/content-ai";
import {
  passageRequestSchema,
  practiceDraftSchema,
  reviewSchema,
} from "@jesus-in-practice/backend/content-contracts";
import { z } from "@jesus-in-practice/backend/validation";
import { categories } from "@jesus-in-practice/content";

import { ServiceError } from "@/lib/server/config";
import { contentRepository } from "@/lib/server/content";
import { body, json, route } from "@/lib/server/http";
import { requireOperator } from "@/lib/server/operator";
import { rateLimit } from "@/lib/server/runtime";

const practiceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("manual"),
      practiceId,
      passage: passageRequestSchema,
      draft: practiceDraftSchema,
      notes: z.string().trim().min(10).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("generate"),
      practiceId,
      passage: passageRequestSchema,
      category: z.enum(categories),
    })
    .strict(),
  z.object({ action: z.literal("review"), versionId: z.uuid(), review: reviewSchema }).strict(),
  z
    .object({ action: z.literal("publish"), versionId: z.uuid(), confirmed: z.literal(true) })
    .strict(),
  z
    .object({
      action: z.literal("withdraw"),
      versionId: z.uuid(),
      reason: z.string().trim().min(10).max(2000),
      confirmed: z.literal(true),
    })
    .strict(),
]);
const querySchema = z
  .object({
    cursor: z
      .string()
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    version: z.uuid().optional(),
    reviewCursor: z
      .string()
      .max(300)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    editionCursor: z
      .string()
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
export const maxDuration = 60;
export const GET = route(async (request) => {
  const actor = await requireOperator(["admin", "editor"]);
  await rateLimit(`operator:content-read:${actor.user.id}`, 100, 60);
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new ServiceError("VALIDATION", "The content page request is invalid.");
  const repo = contentRepository();
  if (parsed.data.version)
    return json({
      version: await repo.getVersion(parsed.data.version, actor.user.id),
      reviews: await repo.listReviews(parsed.data.version, actor.user.id, {
        limit: 25,
        cursor: parsed.data.reviewCursor,
      }),
    });
  const [drafts, editions] = await Promise.all([
    repo.listDrafts(actor.user.id, { cursor: parsed.data.cursor, limit: 20 }),
    repo.listEditions(actor.user.id, { cursor: parsed.data.editionCursor, limit: 25 }),
  ]);
  return json({
    drafts,
    editions,
    aiEnabled:
      process.env.ENABLE_AI_DRAFTING === "true" &&
      !!process.env.OPENAI_API_KEY &&
      !!process.env.OPENAI_CONTENT_MODEL,
    rightsEnabled: process.env.CONTENT_RIGHTS_ENABLED === "true",
  });
});
export const POST = route(async (request) => {
  const input = await body(request, schema);
  const actor = await requireOperator(["admin", "editor"]);
  await rateLimit(`operator:content-write:${actor.user.id}`, 20, 60);
  const repo = contentRepository();
  switch (input.action) {
    case "manual":
      return json(
        {
          version: await repo.createDraft(
            {
              practiceId: input.practiceId,
              passage: input.passage,
              draft: input.draft,
              provenance: { kind: "manual", notes: input.notes },
            },
            actor.user.id,
          ),
        },
        201,
      );
    case "generate": {
      await rateLimit("operator:ai-global-daily", 20, 86400);
      await rateLimit(`operator:ai:${actor.user.id}`, 3, 60);
      const passage = await repo.retrievePassage(input.passage, { forAi: true });
      const result = await new ContentDrafter(contentAiConfigFromEnv(process.env)).draft(
        passage,
        input.category,
      );
      if (result.outcome === "insufficient_context") return json(result);
      return json(
        {
          outcome: "draft",
          version: await repo.createDraft(
            {
              practiceId: input.practiceId,
              passage: input.passage,
              draft: result.draft,
              provenance: result.provenance,
            },
            actor.user.id,
          ),
        },
        201,
      );
    }
    case "review":
      return json({
        version: await repo.reviewDraft(input.versionId, input.review, actor.user.id),
      });
    case "publish":
      return json({ version: await repo.publish(input.versionId, actor.user.id) });
    case "withdraw":
      return json({ version: await repo.withdraw(input.versionId, input.reason, actor.user.id) });
  }
});
