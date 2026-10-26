import { PlansView } from "@/components/settings-view";
export const metadata = {
  title: process.env.NEXT_PUBLIC_APP_MODE === "live" ? "SMS wallet" : "Plans",
};
export default function Page() {
  return <PlansView />;
}
