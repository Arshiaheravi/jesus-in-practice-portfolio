import { deletionSchema } from "@jesus-in-practice/backend/validation";

import { adminAuth, authClient, requireUser } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { rateLimit, repository } from "@/lib/server/runtime";

export const DELETE = route(async (request) => {
  const user = await requireUser();
  await body(request, deletionSchema);
  await rateLimit(`delete:${user.id}`, 5, 3600);
  const admin = adminAuth(); // Require deletion credentials before freezing the account.
  await repository().prepareAccountDeletion(user.id);
  const { error } = await admin.deleteUser(user.id);
  if (error)
    throw new ServiceError(
      "DELETION_PENDING",
      "Your account is paused for deletion. Retry deletion or contact support to finish it.",
      503,
    );
  await (await authClient()).auth.signOut({ scope: "local" });
  return json({ ok: true });
});
