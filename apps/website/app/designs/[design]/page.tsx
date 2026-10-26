import type { Metadata } from "next";
import { notFound } from "next/navigation";

import DesignHome from "@/components/design-home";
import DesignPreviewToolbar from "@/components/design-preview-toolbar";
import { pageMetadata } from "@/lib/site";

import { designs, getDesign } from "../../../../../shared/designs";
import Home from "../../page";

type DesignPageProps = { params: Promise<{ design: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return designs.map(({ id }) => ({ design: id }));
}

export async function generateMetadata({ params }: DesignPageProps): Promise<Metadata> {
  const design = getDesign((await params).design);
  if (!design) notFound();
  return {
    ...pageMetadata(
      `${design.name} website design`,
      `${design.description} Preview this homepage direction for Jesus in Practice.`,
      `/designs/${design.id}`,
    ),
    robots: { index: false, follow: false },
  };
}

export default async function DesignPage({ params }: DesignPageProps) {
  const design = getDesign((await params).design);
  if (!design) notFound();
  return (
    <>
      <DesignPreviewToolbar design={design} />
      {design.id === "heritage" ? (
        <div data-design="heritage">
          <Home />
        </div>
      ) : (
        <DesignHome design={design.id} />
      )}
    </>
  );
}
