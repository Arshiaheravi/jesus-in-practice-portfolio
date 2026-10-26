import type { MetadataRoute } from "next";

import { indexable, siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: indexable
      ? { userAgent: "*", allow: "/", disallow: ["/signin", "/signup", "/reset-password"] }
      : { userAgent: "*", disallow: "/" },
    ...(indexable ? { sitemap: `${siteUrl}/sitemap.xml` } : {}),
  };
}
