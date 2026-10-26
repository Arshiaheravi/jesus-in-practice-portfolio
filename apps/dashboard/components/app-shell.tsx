"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import {
  ArrowLeftIcon,
  BookmarkIcon,
  CalendarIcon,
  ChatBubbleIcon,
  ChevronRightIcon,
  Cross2Icon,
  GearIcon,
  HamburgerMenuIcon,
  HomeIcon,
  InfoCircledIcon,
  QuestionMarkCircledIcon,
  ReaderIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo-provider";
import { MemberContent } from "@/components/member-status";
import { websiteLink } from "@/lib/links";

const navigation = [
  { href: "/dashboard", title: "Today", Icon: HomeIcon },
  { href: "/library", title: "Practice library", Icon: ReaderIcon },
  { href: "/saved", title: "Saved practices", Icon: BookmarkIcon },
  { href: "/schedule", title: "Your rhythm", Icon: CalendarIcon },
  { href: "/deliveries", title: "Messages", Icon: ChatBubbleIcon },
  { href: "/progress", title: "Your journey", Icon: SunIcon },
];
const secondary = [
  { href: "/settings/preferences", title: "Preferences", Icon: GearIcon },
  { href: "/help", title: "Help & guidance", Icon: QuestionMarkCircledIcon },
];

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link className={`brand ${small ? "brand-small" : ""}`} href="/dashboard">
      <span className="brand-mark" aria-hidden="true">
        j<span>p</span>
      </span>
      <span>
        Jesus <span className="brand-light">in</span> Practice
        <small>Faith in everyday life.</small>
      </span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const { state, mode } = useDemo();
  return (
    <>
      <Brand />
      <p className="nav-caption">YOUR PRACTICE</p>
      <nav aria-label="Main navigation">
        {navigation.map(({ href, title, Icon }) => (
          <Link
            onClick={onNavigate}
            className={`nav-link ${pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""}`}
            href={href}
            key={href}
            aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            {title}
            {href === "/saved" && state.saved.length > 0 && (
              <span className="nav-count">{state.saved.length}</span>
            )}
          </Link>
        ))}
        {mode === "live" && (
          <Link
            onClick={onNavigate}
            className={`nav-link ${pathname === "/wallet" ? "active" : ""}`}
            href="/wallet"
            aria-current={pathname === "/wallet" ? "page" : undefined}
          >
            <ReaderIcon aria-hidden="true" />
            SMS wallet
          </Link>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <span className="eyebrow">A SIMPLE WAY TO LEARN</span>
          <p>
            Read it. Understand it.
            <br />
            Put it into practice.
          </p>
        </div>
        <nav aria-label="Support navigation">
          {secondary.map(({ href, title, Icon }) => (
            <Link
              onClick={onNavigate}
              className={`nav-link ${pathname.startsWith(href) ? "active" : ""}`}
              href={href}
              key={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              {title}
            </Link>
          ))}
        </nav>
        <a className="back-website" href={websiteLink()}>
          <ArrowLeftIcon aria-hidden="true" />
          Back to website
        </a>
      </div>
    </>
  );
}

export default function AppShell({
  children,
  pageTitle,
}: {
  children: React.ReactNode;
  pageTitle?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { state, issue, savePreview, mode, loadError, refresh } = useDemo();
  const page =
    pageTitle ||
    navigation.find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
      ?.title ||
    (pathname === "/wallet"
      ? "SMS wallet"
      : pathname.startsWith("/settings")
        ? "Settings"
        : "Help & guidance");
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Navigation onNavigate={() => {}} />
      </aside>
      <Dialog open={mobileOpen} onClose={setMobileOpen} className="mobile-dialog">
        <DialogBackdrop className="dialog-backdrop" />
        <DialogPanel className="mobile-sidebar">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <Cross2Icon aria-hidden="true" />
          </button>
          <Navigation onNavigate={() => setMobileOpen(false)} />
        </DialogPanel>
      </Dialog>
      <div className="app-content">
        <header className="app-header">
          <div className="header-start">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <HamburgerMenuIcon aria-hidden="true" />
            </button>
            <span className="header-breadcrumb">
              Your space
              <ChevronRightIcon aria-hidden="true" />
              <strong>{page}</strong>
            </span>
          </div>
          <Link className="account-link" href="/settings/account">
            <span className="avatar">YP</span>
            <span>{mode === "live" ? "Your account" : "Your preview"}</span>
          </Link>
        </header>
        {mode === "preview" ? (
          <div className="preview-banner" role="region" aria-label="Preview information">
            <InfoCircledIcon aria-hidden="true" />
            <p>
              <strong>Interactive preview.</strong> Your choices stay in this browser. No account,
              messages, or charges.
            </p>
            <Link href="/help#preview">About this preview</Link>
          </div>
        ) : (
          <div className="preview-banner" role="region" aria-label="Account information">
            <InfoCircledIcon aria-hidden="true" />
            <p>Your account is free. Optional SMS uses prepaid credit.</p>
            <Link href="/settings/account">Account & consent</Link>
          </div>
        )}
        {mode === "live" && loadError && (
          <div className="storage-banner" role="status">
            <p>{loadError}</p>
            <button onClick={() => void refresh()}>Refresh account</button>
          </div>
        )}
        {issue && (
          <div className="storage-banner" role="status">
            <p>
              {issue === "storage"
                ? "Browser storage is unavailable. Changes work in this tab but may disappear when you leave."
                : "Saved preview data could not be read. Your current changes stay in this tab. Save fresh preview replaces the unreadable browser data."}
            </p>
            <button type="button" onClick={() => savePreview()}>
              {issue === "storage" ? "Retry saving" : "Save fresh preview"}
            </button>
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="main-content">
          <MemberContent>{children}</MemberContent>
        </main>
        <footer className="app-footer">
          <span>Faith in everyday life.</span>
          <Link href="/help#sources">About our sources</Link>
        </footer>
        <nav className="mobile-bottom-nav" aria-label="Quick navigation">
          {navigation
            .filter((item) =>
              ["/dashboard", "/library", "/schedule", "/progress"].includes(item.href),
            )
            .map(({ href, title, Icon }) => (
              <Link href={href} key={href} aria-current={pathname === href ? "page" : undefined}>
                <Icon aria-hidden="true" />
                <span>
                  {title === "Practice library"
                    ? "Library"
                    : title === "Your rhythm"
                      ? "Rhythm"
                      : title === "Your journey"
                        ? "Journey"
                        : title}
                </span>
              </Link>
            ))}
        </nav>
      </div>
      <span className="sr-only" aria-live="polite">
        {state.schedule.paused
          ? `${mode === "preview" ? "Preview r" : "R"}eminders are paused`
          : ""}
      </span>
    </div>
  );
}
