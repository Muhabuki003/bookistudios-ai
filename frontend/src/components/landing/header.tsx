import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import type { Locale } from "@/core/i18n/locale";
import { getI18n } from "@/core/i18n/server";
import { GITHUB_REPO_URL } from "@/core/site/links";
import { cn } from "@/lib/utils";

export type HeaderProps = {
  className?: string;
  homeURL?: string;
  locale?: Locale;
};

export async function Header({ className, homeURL, locale }: HeaderProps) {
  const { t } = await getI18n(locale);
  return (
    <header
      className={cn(
        "container-md fixed top-0 right-0 left-0 z-20 mx-auto flex h-16 items-center justify-between backdrop-blur-xs",
        className,
      )}
    >
      <div className="flex items-center gap-6">
        <a href={homeURL ?? "/"}>
          <h1 className="font-serif text-xl">bookistudios AI</h1>
        </a>
      </div>
      <nav className="mr-8 ml-auto flex items-center gap-8 text-sm font-medium">
        <Link
          href="/en/docs"
          className="text-secondary-foreground hover:text-foreground transition-colors"
        >
          {t.home.docs}
        </Link>
        <Link
          href="/pricing"
          className="text-secondary-foreground hover:text-foreground transition-colors"
        >
          {t.home.pricing}
        </Link>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-secondary-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          GitHub
          <ArrowUpRightIcon aria-hidden className="size-3.5" />
        </a>
      </nav>
      <hr className="from-border/0 via-border/70 to-border/0 absolute top-16 right-0 left-0 z-10 m-0 h-px w-full border-none bg-linear-to-r" />
    </header>
  );
}
