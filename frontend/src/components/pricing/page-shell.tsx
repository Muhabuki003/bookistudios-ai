import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";

/**
 * Shell for the billing surfaces. Unlike the landing page these are not painted
 * on a dark canvas — they follow the app's own palette in either theme.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-screen w-full pb-24">
      <Header className="bg-background/80 border-border border-b" />
      <div className="pt-16">{children}</div>
      <Footer />
    </div>
  );
}
