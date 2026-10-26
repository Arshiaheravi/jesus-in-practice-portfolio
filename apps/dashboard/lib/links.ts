const fallback = "http://127.0.0.1:3000";
function configuredOrigin(value: string | undefined): string {
  try {
    const url = new URL(value || fallback);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : fallback;
  } catch {
    return fallback;
  }
}
export const siteUrl = configuredOrigin(process.env.NEXT_PUBLIC_SITE_URL);
export function websiteLink(path = "/") {
  return new URL(path, siteUrl).toString();
}
