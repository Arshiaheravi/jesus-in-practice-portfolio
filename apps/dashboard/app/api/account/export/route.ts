import { requireUser } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { json, route } from "@/lib/server/http";
import { rateLimit, repository } from "@/lib/server/runtime";

export const GET = route(async () => {
  const user = await requireUser();
  await rateLimit(`export:${user.id}`, 3, 3600);
  const data = { email: user.email, ...(await repository().exportUserData(user.id)) };
  // Never silently return a truncated export. Large accounts need a support-assisted export.
  if (Buffer.byteLength(JSON.stringify(data)) > 10 * 1024 * 1024)
    throw new ServiceError(
      "EXPORT_TOO_LARGE",
      "Contact support for a complete export of this account.",
      409,
    );
  const response = json(data);
  response.headers.set(
    "Content-Disposition",
    'attachment; filename="jesus-in-practice-account.json"',
  );
  return response;
});
