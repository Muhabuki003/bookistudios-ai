import { PageShell } from "@/components/pricing/page-shell";

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
