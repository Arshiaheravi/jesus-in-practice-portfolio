import { redirect } from "next/navigation";

import AuthLiveView from "@/components/auth-live-view";
import { liveMode } from "@/lib/member-api";
export default function Page() {
  if (liveMode) return <AuthLiveView signup />;
  redirect("/onboarding");
}
