import "./css/style.css";
import "./css/design-variants.css";
import "./css/design-gallery.css";

import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";

import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { indexable, siteUrl } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Jesus in Practice | Faith for everyday life",
    template: "%s | Jesus in Practice",
  },
  description:
    "Turn scripture into one thoughtful action. Explore practical lessons from the King James Bible and, if you choose, the Book of Mormon.",
  applicationName: "Jesus in Practice",
  robots: { index: indexable, follow: indexable },
  openGraph: {
    type: "website",
    locale: "en_CA",
    siteName: "Jesus in Practice",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Jesus in Practice. Live the teachings of Jesus, one day at a time.",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className={`${inter.variable} ${lora.variable}`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
