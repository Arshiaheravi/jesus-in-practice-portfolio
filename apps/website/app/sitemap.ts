import { practices } from "@jesus-in-practice/content";
import type { MetadataRoute } from "next";

import { indexable, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return indexable
    ? [
        "",
        "/how-it-works",
        "/practices",
        "/about",
        "/pricing",
        "/support",
        "/privacy",
        "/terms",
        "/accessibility",
        ...practices.map((practice) => `/practices/${practice.id}`),
      ].map((path) => ({ url: `${siteUrl}${path}` }))
    : [];
}
