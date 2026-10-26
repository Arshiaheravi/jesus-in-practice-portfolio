"use client";

import { Cross2Icon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import Brand from "@/components/brand";
import { liveMode, memberUrl } from "@/lib/site";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/practices", label: "Explore practices" },
  { href: "/about", label: "Our purpose" },
  { href: "/pricing", label: "Pricing" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
  }
  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          close();
          toggle.current?.focus();
        }
      }}
    >
      <div className="preview-strip">
        {liveMode ? (
          <>
            Free accounts and email lessons. <span>Optional prepaid SMS. No subscription.</span>
          </>
        ) : (
          <>
            A first look at Jesus in Practice. <span>Explore freely. No messages or charges.</span>
          </>
        )}
      </div>
      <div className="nav-row container">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname.startsWith(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <a
            className="text-link desktop-entry"
            href={memberUrl(liveMode ? "/signin" : "/dashboard")}
          >
            {liveMode ? "Sign in" : "Open demo"}
          </a>
          <Link className="button button-small" href="/signup">
            Get started <span aria-hidden="true">↗</span>
          </Link>
          <button
            className="menu-toggle"
            ref={toggle}
            type="button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <Cross2Icon width={20} height={20} aria-hidden="true" />
            ) : (
              <HamburgerMenuIcon width={20} height={20} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          className="mobile-nav container"
          aria-label="Mobile navigation"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              close();
              toggle.current?.focus();
            }
          }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              aria-current={pathname.startsWith(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <a href={memberUrl(liveMode ? "/signin" : "/dashboard")} onClick={close}>
            {liveMode ? "Sign in" : "Open demo"}
          </a>
          <Link href="/support" onClick={close}>
            Help & answers
          </Link>
        </nav>
      )}
    </header>
  );
}
