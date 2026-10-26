import { ArrowRightIcon } from "@radix-ui/react-icons";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { memberUrl, pageMetadata } from "@/lib/site";

import { designs } from "../../../../shared/designs";

export const metadata: Metadata = {
  ...pageMetadata(
    "Five design directions",
    "Compare five visual directions for Jesus in Practice. Explore each website homepage and matching member Today screen.",
    "/designs",
  ),
  robots: { index: false, follow: false },
};

export default function DesignsPage() {
  return (
    <div className="design-gallery container">
      <header className="design-gallery-heading">
        <div>
          <p className="design-gallery-label">Jesus in Practice · Design collection</p>
          <h1>
            One purpose.
            <br />
            Five ways to bring it to life.
          </h1>
        </div>
        <div className="design-gallery-intro">
          <p>
            Explore the colours, typography, and atmosphere of each direction. Open a website, then
            its matching dashboard to see how it feels in use.
          </p>
          <p className="design-gallery-scope">
            Each option previews the homepage and the member Today screen. Other pages keep the
            current design. All remain local previews; no messages are sent.
          </p>
        </div>
      </header>

      <div className="design-gallery-grid">
        {designs.map((design, index) => (
          <article
            className="design-option"
            key={design.id}
            aria-labelledby={`design-${design.id}`}
          >
            <Link
              className="design-option-preview"
              href={`/designs/${design.id}`}
              aria-label={`Preview the ${design.name} website`}
            >
              <Image
                src={design.previewImage}
                alt={`${design.name} homepage design`}
                width={1200}
                height={800}
                sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                priority={index < 2}
              />
              <span className="design-preview-hint" aria-hidden="true">
                Open website <ArrowRightIcon />
              </span>
            </Link>
            <div className="design-option-body">
              <div className="design-option-title">
                <span className="design-option-number">
                  <span className="sr-only">Option </span>
                  {String(design.number).padStart(2, "0")}
                </span>
                <h2 id={`design-${design.id}`}>{design.name}</h2>
              </div>
              {design.id === "heritage" && <p className="design-current-label">Current design</p>}
              <p className="design-option-description">{design.description}</p>
              <div className="design-option-palette">
                <div className="design-swatches" aria-hidden="true">
                  {design.palette.map((colour) => (
                    <span key={colour} style={{ backgroundColor: colour }} />
                  ))}
                </div>
                <span>{design.paletteLabel}</span>
              </div>
              <div className="design-option-actions">
                <Link className="design-gallery-link" href={`/designs/${design.id}`}>
                  View website<span className="sr-only">: {design.name}</span>
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
                <a
                  className="design-gallery-link design-gallery-link-secondary"
                  href={memberUrl(`/designs/${design.id}`)}
                >
                  View dashboard<span className="sr-only">: {design.name}</span>
                  <ArrowRightIcon aria-hidden="true" />
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>

      <footer className="design-gallery-note">
        <p>Choose the direction that makes you want to return tomorrow.</p>
        <span>
          The scripture, practical lessons, and source choices stay at the heart of every option.
        </span>
      </footer>
    </div>
  );
}
