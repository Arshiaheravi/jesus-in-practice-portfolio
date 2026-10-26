import OperatorShell from "@/components/operator-shell";
export const metadata = { title: "Operator workspace", robots: { index: false, follow: false } };
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return <OperatorShell>{children}</OperatorShell>;
}
