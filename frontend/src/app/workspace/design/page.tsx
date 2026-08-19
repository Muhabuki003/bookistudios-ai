"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon, XIcon } from "lucide-react";

interface DaemonProject {
  id: string;
  name: string;
  status?: {
    value?: string;
    runId?: string;
  };
}

const RUNNING = new Set(["running", "queued", "idle"]);
const IDLE_STATUSES = new Set(["not_started", "running", "idle", "queued"]);

/**
 * BSAI Design tab — embeds OpenDesign (design.bsaiagents.com) in an iframe and
 * adds a live preview pane:
 *  - while a design run is RUNNING, the pane opens immediately and the artifact
 *    iframe refreshes every ~3s, so the page visibly gets built (Claude-design
 *    style);
 *  - when the run finishes with an artifact (index.html in the project), the
 *    pane locks on the final result. Question-only turns (no artifact) stay
 *    quiet. Zero clicks either way.
 */
export default function DesignPage() {
  const [preview, setPreview] = useState<{
    id: string;
    name: string;
    live: boolean;
  } | null>(null);
  const known = useRef<Record<string, { runId?: string; status?: string }>>({});
  const initialized = useRef(false);

  useEffect(() => {
    const checkArtifact = async (p: DaemonProject) => {
      try {
        const url = `/api/code/projects/${encodeURIComponent(p.id)}/preview`;
        const res = await fetch(url);
        if (res.ok) {
          setPreview({ id: p.id, name: p.name || p.id, live: false });
        }
      } catch {
        // transient — next trigger retries
      }
    };

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
        const current: Record<string, { runId?: string; status?: string }> = {};
        for (const p of projects) {
          current[p.id] = {
            runId: p.status?.runId,
            status: p.status?.value,
          };
        }
        if (!initialized.current) {
          known.current = current;
          initialized.current = true;
          return;
        }
        for (const p of projects) {
          const runId = p.status?.runId;
          const status = p.status?.value ?? "unknown";
          const prev = known.current[p.id];
          const newRun = !!runId && runId !== prev?.runId;

          if (newRun && RUNNING.has(status)) {
            // Agent started working — open the pane live, artifact appears
            // as it gets written.
            setPreview({ id: p.id, name: p.name || p.id, live: true });
          } else if (
            newRun &&
            !RUNNING.has(status) &&
            !IDLE_STATUSES.has(status)
          ) {
            // Fast run that finished between polls — show final artifact if
            // one exists.
            void checkArtifact(p);
          } else if (
            !newRun &&
            prev?.runId &&
            RUNNING.has(prev.status ?? "") &&
            !RUNNING.has(status) &&
            preview?.id === p.id
          ) {
            // Run just finished — lock the live pane onto the final artifact.
            setPreview((cur) => (cur ? { ...cur, live: false } : cur));
          }
        }
        known.current = current;
      } catch {
        // transient network hiccup — next tick retries
      }
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [preview?.id]);

  // Live refresh: while preview.live, re-point the iframe every 3s so the
  // in-progress artifact visibly updates.
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    if (!preview?.live) return;
    const iv = setInterval(() => setStamp((s) => s + 1), 3000);
    return () => clearInterval(iv);
  }, [preview?.live]);

  const previewUrl = preview
    ? `/api/code/projects/${encodeURIComponent(preview.id)}/preview?t=${stamp}`
    : null;

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
            </span>
            <div className="flex shrink-0 items-center gap-1">
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
                onClick={() => setPreview(null)}
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Close preview"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>
          <iframe
            src={previewUrl}
            className="min-h-0 w-full flex-1 border-0"
            title={`Preview — ${preview.name}`}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}
