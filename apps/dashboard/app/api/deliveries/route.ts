import { cursorSchema } from "@jesus-in-practice/backend/validation";

import { requireUser } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { json, route } from "@/lib/server/http";
import { database } from "@/lib/server/runtime";

export const GET = route(async (request) => {
  const user = await requireUser();
  const cursor = cursorSchema.safeParse(
    new URL(request.url).searchParams.get("cursor") ?? undefined,
  );
  if (!cursor.success) throw new ServiceError("VALIDATION", "Invalid message history cursor.");
  let after: { date: string; id: string } | null = null;
  if (cursor.data) {
    try {
      after = JSON.parse(Buffer.from(cursor.data, "base64url").toString());
      if (!after || !/^[a-f0-9-]{36}$/i.test(after.id) || !Number.isFinite(Date.parse(after.date)))
        throw new Error();
    } catch {
      throw new ServiceError("VALIDATION", "Invalid message history cursor.");
    }
  }
  const result = await database().withUser(user.id, async (sql) => {
    const rows = (
      await sql.query<{
        id: string;
        practiceId: string;
        channel: string;
        status: string;
        scheduledAt: Date;
        updatedAt: Date;
        createdAt: Date;
        quoteCents: number;
        segments: number;
        failureCode: string | null;
      }>(
        `select id,practice_id as "practiceId",channel,status,scheduled_at as "scheduledAt",updated_at as "updatedAt",created_at as "createdAt",(payload->>'quoteCents')::integer as "quoteCents",(payload->>'segments')::integer as segments,failure_code as "failureCode" from app.deliveries where user_id=$1 and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid)) order by created_at desc,id desc limit 51`,
        [user.id, after?.date ?? null, after?.id ?? null],
      )
    ).rows;
    const total = Number(
      (
        await sql.query<{ total: string }>(
          "select count(*) as total from app.deliveries where user_id=$1",
          [user.id],
        )
      ).rows[0].total,
    );
    const items = rows.slice(0, 50);
    const last = items.at(-1);
    return {
      items,
      total,
      nextCursor:
        rows.length > 50 && last
          ? Buffer.from(
              JSON.stringify({ date: last.createdAt.toISOString(), id: last.id }),
            ).toString("base64url")
          : null,
    };
  });
  return json(result);
});
