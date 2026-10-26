import "./css/style.css";
import "./css/design-variants.css";
import "./css/operator.css";

import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import { headers } from "next/headers";

import { DemoProvider } from "@/components/demo-provider";
import Theme from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: { default: "Your practice · Jesus in Practice", template: "%s · Jesus in Practice" },
  description:
    "Understand a scripture teaching, see it in everyday life, and put it into practice. Your personal learning preview.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce =
    process.env.NEXT_PUBLIC_APP_MODE === "live"
      ? (await headers()).get("x-nonce") || undefined
      : undefined;
  return (
    <html lang="en-CA" className={`${inter.variable} ${lora.variable}`} suppressHydrationWarning>
      <body>
        <Theme nonce={nonce}>
          <DemoProvider>{children}</DemoProvider>
        </Theme>
      </body>
    </html>
  );
}
