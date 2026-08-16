"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreditCardIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react";

interface BillingStatus {
  active: boolean;
  plan?: string;
  cycle?: string;
  seats?: number;
  status?: string;
  currentPeriodEnd?: string;
}

export function BillingSettingsPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const data = await res.json();
      setStatus(data);
    } catch {
      setError("Could not load billing info.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openPortal = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Could not open billing portal.");
    } catch {
      setError("Could not open billing portal.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Loading billing…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCardIcon className="size-4" /> Current Plan
          </CardTitle>
          <CardDescription>
            Your BSAI Agents subscription and payment details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status?.active ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold capitalize">
                  {status.plan}
                </span>
                <span className="text-sm capitalize text-muted-foreground">
                  {status.cycle} · {status.seats ?? 1} seat
                  {(status.seats ?? 1) > 1 ? "s" : ""}
                </span>
              </div>
              {status.currentPeriodEnd ? (
                <p className="text-sm text-muted-foreground">
                  Renews{" "}
                  {new Date(status.currentPeriodEnd).toLocaleDateString()}
                </p>
              ) : null}
              <Button onClick={openPortal} disabled={busy}>
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <ExternalLinkIcon className="size-4" />
                )}
                Manage billing
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You are on the free trial. Pick a plan to unlock everything.
              </p>
              <Button asChild>
                <a href="/pricing">Choose a plan</a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
