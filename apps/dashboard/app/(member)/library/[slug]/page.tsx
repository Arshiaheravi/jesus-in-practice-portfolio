import { getPractice, practices } from "@jesus-in-practice/content";
import { notFound } from "next/navigation";

import PracticeView from "@/components/practice-view";

export const dynamicParams = false;

export function generateStaticParams() {
  return practices.map((practice) => ({ slug: practice.id }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: getPractice(slug)?.title || "Practice not found" };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const practice = getPractice(slug);
  if (!practice) notFound();
  return <PracticeView key={practice.id} practice={practice} />;
}
