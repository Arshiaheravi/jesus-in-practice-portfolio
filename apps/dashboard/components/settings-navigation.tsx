"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDemo } from "@/components/demo-provider";

export default function SettingsNavigation() {
  const path = usePathname();
  const { mode } = useDemo();
  return (
    <nav className="settings-tabs" aria-label="Settings sections">
      {[
        { href: "/settings/preferences", title: "Your preferences" },
        {
          href: "/settings/account",
          title: mode === "live" ? "Account & consent" : "Your preview & data",
        },
        {
          href: mode === "live" ? "/wallet" : "/settings/plans",
          title: mode === "live" ? "SMS wallet" : "Plans",
        },
      ].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={path === item.href ? "page" : undefined}
        >
          {item.title}
        </Link>
      ))}
    </nav>
  );
}
