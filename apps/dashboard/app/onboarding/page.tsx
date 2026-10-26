import OnboardingView from "@/components/onboarding-view";
export const metadata = { title: "Set up your practice" };
export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <OnboardingView initialPlan={plan === "email" || plan === "both" ? plan : undefined} />;
}
