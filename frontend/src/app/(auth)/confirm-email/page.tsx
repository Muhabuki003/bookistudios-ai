"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ConfirmState =
  | { status: "verifying" }
  | { status: "success"; email?: string }
  | { status: "error"; code?: string; message: string };

function ConfirmEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [state, setState] = useState<ConfirmState>({ status: "verifying" });
  const [email, setEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setState({
        status: "error",
        message: "This confirmation link is missing its token.",
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/auth/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok) {
          setState({ status: "success", email: data?.email });
        } else {
          setState({
            status: "error",
            code: data?.detail?.code ?? data?.code,
            message:
              data?.detail?.message ??
              data?.message ??
              "We could not confirm that link.",
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Network error. Please try again.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const resend = async () => {
    if (!email.trim()) return;
    setResendState("sending");
    setResendMsg("");
    try {
      const res = await fetch("/api/v1/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setResendMsg(
          data?.detail?.message ?? "Could not resend. Try again.",
        );
        return;
      }
      setResendMsg("A fresh confirmation link is on its way.");
    } catch {
      setResendMsg("Network error. Try again.");
    } finally {
      setResendState("idle");
    }
  };

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="border-border/20 bg-background/5 w-full max-w-md space-y-6 rounded-3xl border p-8 backdrop-blur-sm">
        <div className="text-center">
          <h1 className="text-foreground font-serif text-3xl">
            bookistudios AI
          </h1>
          <p className="text-muted-foreground mt-2">
            {state.status === "success"
              ? "Account confirmed"
              : state.status === "error"
                ? "Confirmation"
                : "Confirming your account…"}
          </p>
        </div>

        {state.status === "verifying" && (
          <div className="text-center">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
            <p className="text-muted-foreground mt-4 text-sm">
              Verifying your email…
            </p>
          </div>
        )}

        {state.status === "success" && (
          <div className="space-y-5 text-center">
            <div className="bg-foreground/5 mx-auto flex size-12 items-center justify-center rounded-full text-xl">
              ✓
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {state.email ? (
                <>
                  <span className="text-foreground font-medium">
                    {state.email}
                  </span>{" "}
                  is confirmed. You can now sign in.
                </>
              ) : (
                "Your email is confirmed. You can now sign in."
              )}
            </p>
            <Button className="w-full" onClick={() => router.push("/login")}>
              Sign in
            </Button>
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">
              {state.message}
            </p>
            {state.code === "token_expired" ||
            state.code === "token_invalid" ? (
              <div className="space-y-2">
                <label htmlFor="resend-email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="resend-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={resendState === "sending"}
                  onClick={resend}
                >
                  {resendState === "sending"
                    ? "Sending…"
                    : "Send a new confirmation link"}
                </Button>
                {resendMsg && (
                  <p className="text-muted-foreground text-xs">{resendMsg}</p>
                )}
              </div>
            ) : null}
            <div className="text-center text-sm">
              <Link href="/login" className="text-blue-500 hover:underline">
                ← Back to sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmEmailInner />
    </Suspense>
  );
}
