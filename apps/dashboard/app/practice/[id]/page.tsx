import { getPractice } from "@jesus-in-practice/content";
import { notFound } from "next/navigation";
import { cache } from "react";

import AppShell from "@/components/app-shell";
import PracticeView from "@/components/practice-view";
import { requireUser } from "@/lib/server/auth";
import { contentRepository } from "@/lib/server/content";

const resolvePractice = cache(async (id: string) => {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))
    notFound();
  await requireUser();
  const practice = getPractice(id) ?? (await contentRepository().getPublished(id));
  if (!practice) notFound();
  return practice;
});
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const practice = await resolvePractice((await params).id);
  return { title: practice.title };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const practice = await resolvePractice((await params).id);
  return (
    <AppShell pageTitle="Practice library">
      <PracticeView key={practice.id} practice={practice} />
    </AppShell>
  );
}
