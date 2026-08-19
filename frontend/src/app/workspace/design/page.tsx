"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon, RefreshCwIcon, XIcon } from "lucide-react";

interface DaemonProject {
  id: string;
  name: string;
  updatedAt?: number;
  status?: {
    value?: string;
    runId?: string;
    updatedAt?: number;
  };
}

// The daemon's REAL status vocabulary (verified live 2026-08-19):
// not_started -> awaiting_inp -> succeeded | failed  (agent runs)
// plus: running/queued/idle/pending for other job types.
const LIVE_STATUSES = new Set([
  "running",
  "queued",
  "idle",
  "pending",
  "awaiting_inp",
  "generating",
  "processing",
  "in_progress",
]);
const FAILED_STATUSES = new Set(["failed", "error"]);

/**
 * BSAI Design tab — embeds OpenDesign (design.bsaiagents.com) and shows a
 * live preview pane:
 *  - a NEW run (any status change on a project) opens the pane immediately;
 *  - while the run is in a non-terminal status the artifact iframe refreshes
 *    every ~3s so the page visibly gets built (Claude-design style), with a
 *    "Building" overlay until the first artifact bytes are confirmed;
 *  - when the run SUCCEEDS the pane locks on the final artifact — even if the
 *    run finished before the tab was opened (most recent succeeded project is
 *    auto-shown on load);
 *  - the Refresh button re-fetches the artifact manually (fallback when auto
 *    detection misses); failed runs show a "build failed" state.
 */
export default function DesignPage() {
  const [preview, setPreview] = useState<{
    id: string;
    name: string;
    live: boolean;
    failed: boolean;
  } | null>(null);
  const [artifactReady, setArtifactReady] = useState(false);
  const [stamp, setStamp] = useState(0);

  const known = useRef<Record<string, { runId?: string; status?: string; updatedAt?: number }>>({});
  const initialized = useRef(false);
  const dismissed = useRef<string | null>(null);
  // Mirror of `preview` for the interval closure (avoid stale state).
  const previewRef = useRef<{ id: string; name: string; live: boolean; failed: boolean } | null>(null);

  function updatePreview(
    next:
      | { id: string; name: string; live: boolean; failed: boolean }
      | null
      | ((cur: { id: string; name: string; live: boolean; failed: boolean } | null) => { id: string; name: string; live: boolean; failed: boolean } | null)
  ) {
    setPreview((cur) => {
      const n = typeof next === "function" ? next(cur) : next;
      previewRef.current = n;
      return n;
    });
  }

  const checkArtifact = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/code/projects/${encodeURIComponent(id)}/preview`);
      return res.ok;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch("/api/design/projects", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = await res.json();
        const projects: DaemonProject[] = Array.isArray(data)
          ? data
          : (data.projects ?? []);

        const current: Record<string, { runId?: string; status?: string; updatedAt?: number }> = {};
        for (const p of projects) {
          current[p.id] = {
            runId: p.status?.runId,
            status: p.status?.value,
            updatedAt: p.status?.updatedAt ?? p.updatedAt,
          };
        }

        if (!initialized.current) {
          known.current = current;
          initialized.current = true;
          // Auto-show the most recently updated project that already has a
          // finished artifact — "the last thing I created" is visible on load.
          const sorted = [...projects].sort(
            (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
          );
          for (const p of sorted) {
            const st = p.status?.value;
            if (st === "succeeded" && p.id !== dismissed.current) {
              if (await checkArtifact(p.id)) {
                updatePreview({ id: p.id, name: p.name || p.id, live: false, failed: false });
                setArtifactReady(true);
                break;
              }
            }
          }
          return;
        }

        for (const p of projects) {
          const c = current[p.id] ?? {};
          const st = c.status ?? "unknown";
          const prev = known.current[p.id];
          const changed =
            !prev ||
            prev.runId !== c.runId ||
            prev.status !== st ||
            prev.updatedAt !== c.updatedAt;
          if (!changed) continue;

          if (LIVE_STATUSES.has(st)) {
            // Agent started (or is still) working — open/keep the pane live.
            updatePreview((cur) =>
              cur?.id === p.id
                ? { ...cur, live: true, failed: false }
                : { id: p.id, name: p.name || p.id, live: true, failed: false }
            );
          } else if (st === "succeeded") {
            const ok = await checkArtifact(p.id);
            if (ok) {
              updatePreview({ id: p.id, name: p.name || p.id, live: false, failed: false });
              setArtifactReady(true);
            } else {
              // Succeeded but no artifact yet — keep whatever is showing; the
              // per-tick re-check below will pick it up.
            }
          } else if (FAILED_STATUSES.has(st)) {
            updatePreview((cur) =>
              cur?.id === p.id ? { ...cur, live: false, failed: true } : cur
            );
          }
        }
        known.current = current;

        // While the pane is open: keep confirming the artifact on every tick
        // (it appears mid-run; the 3s stamp refresh then shows it live).
        const shown = previewRef.current;
        if (shown) {
          const ok = await checkArtifact(shown.id);
          if (ok !== artifactReady) setArtifactReady(ok);
        }
      } catch {
        // transient — next tick retries
      }
    };

    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live refresh: while preview.live, re-point the iframe every 3s so the
  // in-progress artifact visibly updates.
  useEffect(() => {
    if (!preview?.live) return;
    const iv = setInterval(() => setStamp((s) => s + 1), 3000);
    return () => clearInterval(iv);
  }, [preview?.live]);

  const showIframe = preview && artifactReady;
  const previewUrl = preview
    ? `/api/code/projects/${encodeURIComponent(preview.id)}/preview?t=${stamp}`
    : null;

  const refreshPreview = async () => {
    setStamp((s) => s + 1);
    if (previewRef.current) {
      setArtifactReady(await checkArtifact(previewRef.current.id));
    }
  };

  const closePreview = () => {
    if (previewRef.current) dismissed.current = previewRef.current.id;
    updatePreview(null);
    setArtifactReady(false);
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <iframe
        src="https://design.bsaiagents.com"
        className="min-h-0 w-full flex-1 border-0"
        title="BSAI Design"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      {preview && previewUrl && (
        <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[640px] flex-col border-l bg-background shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{preview.name}</span>
              {preview.live && (
                <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Building
                </span>
              )}
              {preview.failed && (
                <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-500">
                  Build failed
                </span>
              )}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={refreshPreview}
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Refresh preview (re-fetch the artifact)"
              >
                <RefreshCwIcon className="size-4" />
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Open in new tab"
              >
                <ExternalLinkIcon className="size-4" />
              </a>
              <button
                onClick={closePreview}
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Close preview"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>
          <div className="relative min-h-0 w-full flex-1">
            {showIframe ? (
              <iframe
                src={previewUrl}
                className="h-full w-full border-0"
                title={`Preview — ${preview.name}`}
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center">
                <span className="text-sm font-medium">
                  {preview.failed
                    ? "Build failed — no preview available"
                    : "Preview not ready yet"}
                </span>
                <span className="max-w-[320px] text-xs text-muted-foreground">
                  {preview.failed
                    ? "The design run ended without producing an artifact."
                    : preview.live
                      ? "The agent is still building — this window refreshes automatically."
                      : "The artifact hasn't been generated yet."}
                </span>
                <button
                  onClick={refreshPreview}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <RefreshCwIcon className="size-3.5" />
                  Refresh
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
