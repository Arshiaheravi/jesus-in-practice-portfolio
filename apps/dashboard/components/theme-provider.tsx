"use client";

import { ThemeProvider } from "next-themes";

export default function Theme({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider
      nonce={nonce}
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      storageKey="jesus-in-practice:appearance"
    >
      {children}
    </ThemeProvider>
  );
}
