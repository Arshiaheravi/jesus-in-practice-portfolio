import type { Metadata } from "next";

function publicUrl(value: string | undefined, fallback: string): string {
  try {
    const url = new URL(value || fallback);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : fallback;
  } catch {
    return fallback;
  }
}

export const siteUrl = publicUrl(process.env.NEXT_PUBLIC_SITE_URL, "http://127.0.0.1:3000");
export const liveMode = process.env.NEXT_PUBLIC_APP_MODE === "live";
export const dashboardUrl = publicUrl(
  process.env.NEXT_PUBLIC_DASHBOARD_URL,
  "http://127.0.0.1:3001",
);
export const indexable =
  process.env.NEXT_PUBLIC_INDEXABLE === "true" &&
  siteUrl.startsWith("https://") &&
  !/localhost|127\.0\.0\.1/.test(siteUrl);

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const brandedTitle = `${title} | Jesus in Practice`;
  const images = [
    {
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "Jesus in Practice. Live the teachings of Jesus, one day at a time.",
    },
  ];
  return {
    title: { absolute: brandedTitle },
    description,
    alternates: { canonical: path },
    // Next.js replaces nested metadata objects; include the shared social fields here.
    openGraph: {
      title: brandedTitle,
      description,
      url: path,
      type: "website",
      locale: "en_CA",
      siteName: "Jesus in Practice",
      images,
    },
    twitter: { card: "summary_large_image", title: brandedTitle, description, images },
  };
}

export function memberUrl(path = "/dashboard"): string {
  return `${dashboardUrl}${path}`;
}
