import { ArrowLeftIcon, ArrowRightIcon, ExternalLinkIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { notFound } from "next/navigation";

import AppShell from "@/components/app-shell";
import TodayView from "@/components/today-view";
import { websiteLink } from "@/lib/links";

import { designs, getDesign } from "../../../../../shared/designs";

export const dynamicParams = false;

export function generateStaticParams() {
  return designs.map((design) => ({ design: design.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ design: string }> }) {
  const { design } = await params;
  const selected = getDesign(design);
  return { title: selected ? `${selected.name} · Dashboard design preview` : "Design not found" };
}

export default async function DesignPreview({ params }: { params: Promise<{ design: string }> }) {
  const { design } = await params;
  const selected = getDesign(design);
  if (!selected) notFound();
  const index = designs.findIndex((entry) => entry.id === selected.id);
  const previous = designs[(index + designs.length - 1) % designs.length];
  const next = designs[(index + 1) % designs.length];

  return (
    <div data-design={selected.id} className="dashboard-design-preview">
      <AppShell pageTitle="Today · design preview">
        <section className="design-comparison-toolbar" aria-label="Design comparison">
          <div>
            <p className="design-comparison-label">
              Design {selected.number} of {designs.length} · {selected.name}
            </p>
            <p className="design-comparison-description">
              Today screen preview. Practice actions work; main navigation returns to the current
              app.
            </p>
          </div>
          <nav aria-label="Compare this design">
            <a href={websiteLink("/designs")} className="design-toolbar-link">
              All designs
            </a>
            <a href={websiteLink(`/designs/${selected.id}`)} className="design-toolbar-link">
              Website design
              <ExternalLinkIcon aria-hidden="true" />
            </a>
            <div className="design-switcher">
              <Link
                href={`/designs/${previous.id}`}
                aria-label={`Previous design: ${previous.name}`}
              >
                <ArrowLeftIcon aria-hidden="true" />
              </Link>
              <Link href={`/designs/${next.id}`} aria-label={`Next design: ${next.name}`}>
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </div>
          </nav>
        </section>
        <TodayView design={selected.id} />
      </AppShell>
    </div>
  );
}
