import { AccountView } from "@/components/settings-view";
export const metadata = {
  title: process.env.NEXT_PUBLIC_APP_MODE === "live" ? "Account & consent" : "Your preview & data",
};
export default function Page() {
  return <AccountView />;
}
