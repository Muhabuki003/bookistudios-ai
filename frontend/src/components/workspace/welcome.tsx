"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useAuth } from "@/core/auth/AuthProvider";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

export function Welcome({
  className,
  mode,
}: {
  className?: string;
  mode?: "ultra" | "pro" | "thinking" | "flash";
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isUltra = useMemo(() => mode === "ultra", [mode]);
  const isSkillMode = searchParams.get("mode") === "skill";
  const name = user?.name?.trim();
  const greeting = name
    ? t.welcome.greetingWithName.replace("{name}", name)
    : t.welcome.greeting;
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col items-center justify-center gap-2 px-8 py-4 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "text-3xl font-bold text-balance",
          isUltra ? "golden-text" : "text-foreground",
        )}
      >
        {isSkillMode ? t.welcome.createYourOwnSkill : greeting}
      </div>
      {isSkillMode && (
        <div className="text-muted-foreground text-sm">
          {t.welcome.createYourOwnSkillDescription.includes("\n") ? (
            <pre className="font-sans whitespace-pre">
              {t.welcome.createYourOwnSkillDescription}
            </pre>
          ) : (
            <p>{t.welcome.createYourOwnSkillDescription}</p>
          )}
        </div>
      )}
    </div>
  );
}
