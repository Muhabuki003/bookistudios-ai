import { PageShell } from "@/components/pricing/page-shell";

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
