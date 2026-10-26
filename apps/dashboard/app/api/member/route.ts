import { memberMutationSchema } from "@jesus-in-practice/backend/validation";

import { requireUser } from "@/lib/server/auth";
import { body, json, route } from "@/lib/server/http";
import { bootstrap } from "@/lib/server/member";
import { rateLimit, repository } from "@/lib/server/runtime";

export const GET = route(async () => json(await bootstrap(await requireUser())));
export const POST = route(async (request) => {
  const user = await requireUser();
  const { revision, command } = await body(request, memberMutationSchema);
  await rateLimit(`member:write:${user.id}`, 120, 60);
  await repository().mutateMember(user.id, revision, command, {
    allowPublished: process.env.CONTENT_RIGHTS_ENABLED === "true",
  });
  return json(await bootstrap(user));
});
