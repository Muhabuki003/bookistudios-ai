"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BotIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  FileCode2Icon,
  FileIcon,
  FolderIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  GithubIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  TerminalIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  createdAt?: number;
  status?: { value?: string };
}

interface TreeEntry {
  name: string;
  type: "file" | "dir";
  path: string;
}

interface GitStatus {
  branch: string | null;
  clean: boolean;
  changes: string[];
}

interface Diff {
  stat: string;
  diff: string;
}

interface ToolChip {
  name: string;
  input: string;
  error?: boolean;
}

interface ChatMsg {
  id: number;
  role: "user" | "agent";
  text: string;
  tools: ToolChip[];
  status?: string;
  done?: boolean;
  usage?: string;
}

async function api(path: string, init?: RequestInit) {
  const resp = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json();
}

const POLL_MS = 1600;

export function CodeWorkspace() {
  const { textInput } = usePromptInputController();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [treePath, setTreePath] = useState("");
  const [fileView, setFileView] = useState<{ path: string; content: string } | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [ghConnected, setGhConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [ghOpen, setGhOpen] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [prOpen, setPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");

  const msgIdRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const active = projects?.find((p) => p.id === activeId) ?? null;

  const loadGit = useCallback(async (pid: string) => {
    try {
      const [status, d] = await Promise.all([
        api(`/api/code/projects/${pid}/git/status`),
        api(`/api/code/projects/${pid}/git/diff`),
      ]);
      setGitStatus(status);
      setDiff(d);
    } catch (e) {
      setGitStatus(null);
      setDiff(null);
    }
  }, []);

  const loadTree = useCallback(async (pid: string, path = "") => {
    try {
      const data = await api(`/api/code/projects/${pid}/tree?path=${encodeURIComponent(path)}`);
      setTree(data.entries ?? []);
      setTreePath(path);
    } catch {
      setTree([]);
    }
  }, []);

  const selectProject = useCallback(
    async (pid: string) => {
      setActiveId(pid);
      setMsgs([]);
      setFileView(null);
      setPrUrl(null);
      setCursor(0);
      setRunId(null);
      await Promise.all([loadTree(pid), loadGit(pid)]);
    },
    [loadTree, loadGit],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projs, gh] = await Promise.all([
          api("/api/code/projects"),
          api("/api/code/github/status"),
        ]);
        if (cancelled) return;
        const list: Project[] = projs.projects ?? [];
        setProjects(list);
        setGhConnected(gh.connected ?? false);
        if (list.length > 0) {
          const last = list[list.length - 1];
          if (last) await selectProject(last.id);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // poll the run event log
  useEffect(() => {
    if (!running || !runId || !activeIdRef.current) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const data = await api(
          `/api/code/projects/${activeIdRef.current}/runs/${runId}/events?after=${cursor}`,
        );
        if (stopped) return;
        setCursor(data.total ?? 0);
        setMsgs((prev) => applyEvents(prev, data.events ?? []));
        if (data.done) {
          setRunning(false);
          if (activeIdRef.current) loadGit(activeIdRef.current);
        }
      } catch {
        /* transient — keep polling */
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [running, runId, cursor, loadGit]);

  function applyEvents(prev: ChatMsg[], events: unknown[]): ChatMsg[] {
    const next = [...prev];
    for (const raw of events as Array<{
      event?: string;
      data?: { type?: string; delta?: string; label?: string; name?: string; input?: { command?: string }; content?: string; isError?: boolean; usage?: { input_tokens?: number; output_tokens?: number } };
    }>) {
      const data = raw.data ?? {};
      if (raw.event === "agent") {
        const type = data.type;
        if (type === "text_delta") {
          const msg = next[next.length - 1];
          if (msg && msg.role === "agent") msg.text += data.delta ?? "";
        } else if (type === "tool_use") {
          const msg = next[next.length - 1];
          if (msg && msg.role === "agent") {
            msg.tools.push({
              name: data.name ?? "tool",
              input: String(data.input?.command ?? data.input ?? "").slice(0, 160),
            });
          }
        } else if (type === "tool_result" && data.isError) {
          const msg = next[next.length - 1];
          if (msg && msg.role === "agent" && msg.tools.length > 0) {
            const tool = msg.tools[msg.tools.length - 1];
            if (tool) tool.error = true;
          }
        } else if (type === "status") {
          const msg = next[next.length - 1];
          if (msg && msg.role === "agent") msg.status = data.label;
        } else if (type === "usage") {
          const msg = next[next.length - 1];
          if (msg && msg.role === "agent") {
            const u = data.usage ?? {};
            msg.usage = `${u.input_tokens ?? 0} in · ${u.output_tokens ?? 0} out`;
          }
        }
      } else if (raw.event === "end") {
        const msg = next[next.length - 1];
        if (msg && msg.role === "agent") {
          msg.done = true;
          msg.status = undefined;
        }
      }
    }
    return next;
  }

  async function send() {
    const message = textInput.value.trim();
    if (!message || !activeId || running) return;
    const pid = activeId;
    setError(null);
    textInput.clear();
    setMsgs((prev) => [
      ...prev,
      { id: ++msgIdRef.current, role: "user", text: message, tools: [] },
      { id: ++msgIdRef.current, role: "agent", text: "", tools: [] },
    ]);
    setCursor(0);
    setRunning(true);
    setRunId(null);
    try {
      const data = await api(`/api/code/projects/${pid}/run`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setRunId(data.runId);
    } catch (e) {
      setRunning(false);
      setError(String(e));
    }
  }

  async function createProject() {
    const name = newName.trim() || "Code workspace";
    setNewOpen(false);
    setNewName("");
    try {
      const data = await api("/api/code/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const pid = data.project?.id;
      const list = await api("/api/code/projects");
      setProjects(list.projects ?? []);
      if (pid) await selectProject(pid);
    } catch (e) {
      setError(String(e));
    }
  }

  async function importRepo() {
    const url = importUrl.trim();
    if (!url) return;
    setImportOpen(false);
    setImportUrl("");
    setError(null);
    try {
      let pid = activeId;
      if (!pid) {
        const created = await api("/api/code/projects", {
          method: "POST",
          body: JSON.stringify({ name: "Imported workspace" }),
        });
        pid = created.project?.id;
      }
      await api(`/api/code/projects/${pid}/import`, {
        method: "POST",
        body: JSON.stringify({ repo_url: url }),
      });
      const list = await api("/api/code/projects");
      setProjects(list.projects ?? []);
      if (pid) await selectProject(pid);
    } catch (e) {
      setError(String(e));
    }
  }

  async function connectGithub() {
    const token = ghToken.trim();
    if (!token) return;
    setGhOpen(false);
    setGhToken("");
    try {
      await api("/api/code/github/token", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setGhConnected(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function createPR() {
    if (!activeId) return;
    setPrOpen(false);
    setError(null);
    try {
      const data = await api(`/api/code/projects/${activeId}/pr`, {
        method: "POST",
        body: JSON.stringify({ title: prTitle.trim() || "Update from BSAI Code", body: prBody }),
      });
      setPrTitle("");
      setPrBody("");
      setPrUrl(data.url ?? null);
      loadGit(activeId);
    } catch (e) {
      setError(String(e));
    }
  }

  async function openFile(path: string) {
    if (!activeId) return;
    try {
      const data = await api(`/api/code/projects/${activeId}/file?path=${encodeURIComponent(path)}`);
      setFileView({ path, content: data.content });
    } catch {
      /* binary or missing */
    }
  }

  const changedCount = gitStatus?.changes.length ?? 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* error banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 border-b bg-red-50 px-4 py-2 text-[13px] text-red-700">
          <span className="truncate">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0">
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <select
          value={activeId ?? ""}
          onChange={(e) => selectProject(e.target.value)}
          className="border-border bg-background h-8 max-w-[220px] rounded-md border px-2 text-[13px]"
        >
          {!activeId && <option value="">Select workspace…</option>}
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || p.id}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
          <PlusIcon className="size-3.5" /> New
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <UploadIcon className="size-3.5" /> Import repo
        </Button>
        <div className="flex-1" />
        {!ghConnected && (
          <Button variant="outline" size="sm" onClick={() => setGhOpen(true)}>
            <GithubIcon className="size-3.5" /> Connect GitHub
          </Button>
        )}
        {ghConnected && (
          <Button
            variant="outline"
            size="sm"
            disabled={!active || changedCount === 0}
            onClick={() => setPrOpen(true)}
          >
            <GitPullRequestIcon className="size-3.5" /> Create PR
            {changedCount > 0 && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[11px] text-red-700">{changedCount}</span>}
          </Button>
        )}
        {active && (
          <Button variant="ghost" size="sm" onClick={() => loadGit(active.id)}>
            <RefreshCwIcon className="size-3.5" />
          </Button>
        )}
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:underline"
          >
            <GitPullRequestIcon className="size-3.5" /> PR #{prUrl.split("/").pop()} open ↗
          </a>
        )}
      </div>

      {!projects ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
          Loading workspaces…
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <div className="bg-card border-border flex size-14 items-center justify-center rounded-2xl border shadow-sm">
            <TerminalIcon className="size-6" />
          </div>
          <div className="text-center">
            <h2 className="text-[17px] font-semibold">Your AI coding workspace</h2>
            <p className="text-muted-foreground mt-1 max-w-[38ch] text-[13.5px]">
              Create a workspace and BSAI Code writes, runs and refactors your code — then pushes it to GitHub as a pull request.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setNewOpen(true)}>
              <PlusIcon className="size-4" /> Create workspace
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <UploadIcon className="size-4" /> Import from GitHub
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* file tree */}
          <div className="border-border hidden w-[240px] shrink-0 flex-col border-r md:flex">
            <div className="flex items-center gap-1 border-b px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <FolderIcon className="size-3.5" /> Files
              {treePath && (
                <button
                  onClick={() => loadTree(activeId!, "")}
                  className="ml-auto text-[11px] text-blue-600 hover:underline"
                >
                  up
                </button>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-2">
                {treePath && (
                  <div className="text-muted-foreground mb-1 flex items-center gap-1 px-2 text-[12px]">
                    <ChevronRightIcon className="size-3" /> {treePath}
                  </div>
                )}
                {tree?.map((entry) =>
                  entry.type === "dir" ? (
                    <button
                      key={entry.path}
                      onClick={() => loadTree(activeId!, entry.path)}
                      className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]"
                    >
                      <FolderIcon className="size-4 shrink-0 text-amber-500" />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ) : (
                    <button
                      key={entry.path}
                      onClick={() => openFile(entry.path)}
                      className={cn(
                        "hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                        fileView?.path === entry.path && "bg-muted",
                      )}
                    >
                      <FileCode2Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ),
                )}
                {(tree?.length ?? 0) === 0 && (
                  <div className="text-muted-foreground px-2 py-4 text-center text-[12px]">
                    No files yet
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* session + diff */}
          <div className="flex min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* file viewer */}
              {fileView ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="border-border flex items-center gap-2 border-b px-3 py-1.5 text-[12px]">
                    <FileIcon className="size-3.5 text-muted-foreground" />
                    <span className="font-mono">{fileView.path}</span>
                    <button onClick={() => setFileView(null)} className="text-muted-foreground ml-auto hover:text-foreground">
                      <XIcon className="size-4" />
                    </button>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <pre className="p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{fileView.content}</pre>
                  </ScrollArea>
                </div>
              ) : showDiff && diff ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="border-border flex items-center gap-2 border-b px-3 py-1.5 text-[12px]">
                    <GitBranchIcon className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">Changes on {gitStatus?.branch ?? "main"}</span>
                    <button onClick={() => setShowDiff(false)} className="text-muted-foreground ml-auto hover:text-foreground">
                      <XIcon className="size-4" />
                    </button>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    {diff.stat && (
                      <pre className="text-muted-foreground border-b px-4 py-2 font-mono text-[12px]">{diff.stat}</pre>
                    )}
                    <pre className="p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{diff.diff || "No changes to show."}</pre>
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  {/* messages */}
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5">
                      {msgs.length === 0 && (
                        <div className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
                          <div className="bg-card border-border flex size-12 items-center justify-center rounded-2xl border shadow-sm">
                            <BotIcon className="size-5" />
                          </div>
                          <div className="max-w-[44ch] text-[13.5px] leading-relaxed">
                            Tell {active?.name ?? "BSAI Code"} what to build in{" "}
                            <span className="font-mono text-[12.5px]">{active?.id}</span>. It edits files, runs commands, and when you're happy, hit{" "}
                            <span className="font-medium">Create PR</span> to push it to GitHub.
                          </div>
                        </div>
                      )}
                      {msgs.map((m) =>
                        m.role === "user" ? (
                          <div key={m.id} className="flex justify-end">
                            <div className="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
                              {m.text}
                            </div>
                          </div>
                        ) : (
                          <div key={m.id} className="flex flex-col gap-2">
                            <div className="border-border bg-card max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
                              {m.text}
                              {!m.text && !m.done && m.status && (
                                <span className="text-muted-foreground inline-flex items-center gap-2 text-[12.5px]">
                                  <Loader2Icon className="size-3.5 animate-spin" /> {m.status}
                                </span>
                              )}
                              {!m.text && !m.status && !m.done && (
                                <span className="text-muted-foreground inline-flex items-center gap-2 text-[12.5px]">
                                  <Loader2Icon className="size-3.5 animate-spin" /> Working…
                                </span>
                              )}
                            </div>
                            {m.tools.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pl-1">
                                {m.tools.map((t, i) => (
                                  <span
                                    key={i}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
                                      t.error
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-border bg-muted text-muted-foreground",
                                    )}
                                  >
                                    <TerminalIcon className="size-3" />
                                    {t.name}
                                    {t.input && <span className="max-w-[180px] truncate">— {t.input}</span>}
                                  </span>
                                ))}
                              </div>
                            )}
                            {m.done && (
                              <div className="text-muted-foreground flex items-center gap-2 pl-1 text-[11.5px]">
                                <CheckCircle2Icon className="size-3.5 text-green-600" />
                                Done
                                {m.usage && <span className="font-mono">· {m.usage}</span>}
                                {changedCount > 0 && (
                                  <button
                                    onClick={() => setShowDiff(true)}
                                    className="font-medium text-blue-600 hover:underline"
                                  >
                                    · view changes
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </ScrollArea>

                  {/* composer */}
                  <div className="px-4 pb-4">
                    <PromptInput
                      className="bg-card/95 border-border/70 rounded-[28px] border shadow-sm backdrop-blur-sm *:data-[slot='input-group']:rounded-[28px]"
                      disabled={!active || running}
                      onSubmit={send}
                    >
                      <PromptInputBody className="absolute top-0 right-0 left-0 z-3">
                        <PromptInputTextarea
                          className="size-full"
                          disabled={!active || running}
                          placeholder={
                            running ? "Agent is working…" : active ? "Tell BSAI Code what to build or fix…" : "Create a workspace to start"
                          }
                        />
                      </PromptInputBody>
                      <PromptInputFooter className="flex">
                        <PromptInputSubmit className="rounded-full" disabled={!active || running} />
                      </PromptInputFooter>
                    </PromptInput>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* dialogs */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>Each workspace is an isolated git repo where the agent codes.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. my-awesome-app"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()}
          />
          <DialogFooter>
            <Button onClick={createProject}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from GitHub</DialogTitle>
            <DialogDescription>
              Clone a public repository into a workspace and start coding on it.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="https://github.com/owner/repo"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && importRepo()}
          />
          <DialogFooter>
            <Button onClick={importRepo}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ghOpen} onOpenChange={setGhOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect GitHub</DialogTitle>
            <DialogDescription>
              Paste a fine-grained personal access token with <span className="font-mono text-[12px]">Contents: read/write</span> and{" "}
              <span className="font-mono text-[12px]">Pull requests: read/write</span> on the repos you work on.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="ghp_… or github_pat_…"
            value={ghToken}
            onChange={(e) => setGhToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connectGithub()}
          />
          <DialogFooter>
            <Button onClick={connectGithub}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={prOpen} onOpenChange={setPrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create pull request</DialogTitle>
            <DialogDescription>
              {changedCount > 0 ? (
                <>
                  {changedCount} file{changedCount === 1 ? "" : "s"} changed on{" "}
                  <span className="font-mono text-[12px]">{gitStatus?.branch ?? "main"}</span>. Changes will be committed and pushed.
                </>
              ) : (
                "No changes to push yet."
              )}
            </DialogDescription>
          </DialogHeader>
          <Input placeholder="PR title" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
          <Textarea
            placeholder="Describe what changed (optional)"
            rows={4}
            value={prBody}
            onChange={(e) => setPrBody(e.target.value)}
          />
          <DialogFooter>
            <Button disabled={changedCount === 0} onClick={createPR}>
              <GitPullRequestIcon className="size-4" /> Create PR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
