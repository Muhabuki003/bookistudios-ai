"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { EarlyAccessModal } from "@/components/early-access-modal";
import { Button } from "@/components/ui/button";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { Input } from "@/components/ui/input";
import { setBsaiUserCookie } from "@/components/workspace/bsai-user-cookie";
import { useAuth } from "@/core/auth/AuthProvider";
import { parseAuthError } from "@/core/auth/types";

/**
 * Validate next parameter
 * Prevent open redirect attacks
 * Per RFC-001: Only allow relative paths starting with /
 */
function validateNextParam(next: string | null): string | null {
  if (!next) {
    return null;
  }

  // Need start with / (relative path)
  if (!next.startsWith("/")) {
    return null;
  }

  // Disallow protocol-relative URLs
  if (
    next.startsWith("//") ||
    next.startsWith("http://") ||
    next.startsWith("https://")
  ) {
    return null;
  }

  // Disallow URLs with different protocols (e.g., javascript:, data:, etc)
  if (next.includes(":") && !next.startsWith("/")) {
    return null;
  }

  // Valid relative path
  return next;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { theme, resolvedTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [earlyAccessOpen, setEarlyAccessOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );

  // Get next parameter for validated redirect
  const nextParam = searchParams.get("next");
  const redirectPath = validateNextParam(nextParam) ?? "/workspace";

  // Redirect if already authenticated (client-side, post-login)
  useEffect(() => {
    if (isAuthenticated) {
      router.push(redirectPath);
    }
  }, [isAuthenticated, redirectPath, router]);

  // Redirect to setup if the system has no users yet
  useEffect(() => {
    let cancelled = false;

    void fetch("/api/v1/auth/setup-status")
      .then((r) => r.json())
      .then((data: { needs_setup?: boolean }) => {
        if (!cancelled && data.needs_setup) {
          router.push("/setup");
        }
      })
      .catch(() => {
        // Ignore errors; user stays on login page
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setErrorCode(null);
    setLoading(true);

    try {
      const endpoint = isLogin
        ? "/api/v1/auth/login/local"
        : "/api/v1/auth/register";
      const body = isLogin
        ? `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
        : JSON.stringify({ email, password, name: name.trim() });

      const headers: HeadersInit = isLogin
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : { "Content-Type": "application/json" };

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        credentials: "include", // Important: include HttpOnly cookie
      });

      if (!res.ok) {
        const data = await res.json();
        const authError = parseAuthError(data);
        setError(authError.message);
        setErrorCode(authError.code);
        return;
      }

      if (isLogin) {
        // Login sets a cookie — keep the shared bsai_user cookie in sync,
        // then redirect to workspace.
        setBsaiUserCookie(email.trim());
        router.push(redirectPath);
        return;
      }

      // Register: account is created but NOT verified — send the user to the
      // pricing page to pick a tier (they confirm their email from the inbox).
      router.push("/pricing");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async (target?: string) => {
    const addr = (target ?? registeredEmail ?? "").trim();
    if (!addr) return;
    setResendState("sending");
    setError("");
    try {
      const res = await fetch("/api/v1/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail?.message ?? "Could not resend. Try again.");
        return;
      }
      setResendState("sent");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResendState("idle");
    }
  };

  // ── Cmd+Shift+O opens the early-access modal ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setEarlyAccessOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Check if already unlocked via cookie ──
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/unlock/check");
        if (res.ok) {
          const data = await res.json();
          if (data.unlocked) setIsUnlocked(true);
        }
      } catch { /* not unlocked */ }
    };
    check();
  }, []);

  const actualTheme = theme === "system" ? resolvedTheme : theme;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <FlickeringGrid
        className="absolute inset-0 z-0 mask-[url(/images/deer.svg)] mask-size-[100vw] mask-center mask-no-repeat md:mask-size-[72vh]"
        squareSize={4}
        gridGap={4}
        color={actualTheme === "dark" ? "white" : "black"}
        maxOpacity={0.3}
        flickerChance={0.25}
      />
      <div className="border-border/20 bg-background/5 w-full max-w-md space-y-6 rounded-3xl border p-8 backdrop-blur-sm">
        <div className="text-center">
          <h1 className="text-foreground font-serif text-3xl">bookistudios AI</h1>
          <p className="text-muted-foreground mt-2">
            {registeredEmail
              ? "Check your inbox"
              : isLogin
                ? "Sign in to your account"
                : "Create a new account"}
          </p>
        </div>

        {registeredEmail ? (
          <div className="space-y-4 text-center">
            <div className="bg-foreground/5 mx-auto flex size-12 items-center justify-center rounded-full text-xl">
              ✉️
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="text-foreground font-medium">
                {registeredEmail}
              </span>
              . Click it to activate your account, then sign in.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={resendState === "sending"}
              onClick={() => resendConfirmation()}
            >
              {resendState === "sending"
                ? "Sending…"
                : resendState === "sent"
                  ? "Sent — check your inbox"
                  : "Resend email"}
            </Button>
            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setRegisteredEmail(null);
                  setIsLogin(true);
                  setError("");
                  setErrorCode(null);
                }}
                className="text-blue-500 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          </div>
        ) : (
          <>
        <form onSubmit={handleSubmit} className="space-y-2">
          {!isLogin && (
            <div className="flex flex-col space-y-1">
              <label htmlFor="name" className="text-sm font-medium">
                Name <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                maxLength={60}
              />
            </div>
          )}
          <div className="flex flex-col space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••••"
              required
              minLength={isLogin ? 6 : 8}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {errorCode === "email_not_verified" && (
            <button
              type="button"
              disabled={resendState === "sending"}
              onClick={() => resendConfirmation(email)}
              className="text-blue-500 text-xs underline disabled:opacity-50"
            >
              {resendState === "sending"
                ? "Sending…"
                : "Resend confirmation email"}
            </button>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Please wait..."
              : isLogin
                ? "Sign In"
                : "Create Account"}
          </Button>
        </form>

        <div className="text-center text-sm">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
              setErrorCode(null);
            }}
            className="text-blue-500 hover:underline"
          >
            {isLogin
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
          </>
        )}

        <div className="text-muted-foreground text-center text-xs">
          <Link href="/" className="hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
      {!isUnlocked && (
        <button
          onClick={() => setEarlyAccessOpen(true)}
          className="fixed bottom-4 right-4 z-40 text-[10px] tracking-widest uppercase text-white/10 hover:text-white/30 transition-colors"
          title="Cmd+Shift+O"
        >
          Early Access
        </button>
      )}
      <EarlyAccessModal
        open={earlyAccessOpen}
        onClose={() => setEarlyAccessOpen(false)}
        onUnlocked={() => setIsUnlocked(true)}
      />
    </div>
  );
}
