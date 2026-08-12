import Link from "next/link";
import { useMemo } from "react";

import { GITHUB_REPO_URL } from "@/core/site/links";
import { cn } from "@/lib/utils";

export type FooterProps = {
  className?: string;
};

export function Footer({ className }: FooterProps) {
  const year = useMemo(() => new Date().getFullYear(), []);
  return (
    <footer
      className={cn(
        "container-md mx-auto mt-32 flex flex-col items-center justify-center",
        className,
      )}
    >
      <hr className="from-border/0 to-border/0 m-0 h-px w-full border-none bg-linear-to-r via-white/20" />
      <div className="text-muted-foreground container flex h-20 flex-col items-center justify-center text-sm">
        <p className="text-center font-serif text-lg md:text-xl">
          &quot;Originated from Open Source, give back to Open Source.&quot;
        </p>
      </div>
      <nav className="text-muted-foreground container mb-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <Link
          href="/pricing"
          className="hover:text-foreground transition-colors"
        >
          Pricing
        </Link>
        <Link
          href="/en/docs"
          className="hover:text-foreground transition-colors"
        >
          Documentation
        </Link>
        <Link
          href="/blog/posts"
          className="hover:text-foreground transition-colors"
        >
          Blog
        </Link>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          GitHub
        </a>
      </nav>
      <div className="text-muted-foreground container mb-8 flex flex-col items-center justify-center text-xs">
        <p>Licensed under MIT License</p>
        <p>&copy; {year} bookistudios AI</p>
      </div>
    </footer>
  );
}
