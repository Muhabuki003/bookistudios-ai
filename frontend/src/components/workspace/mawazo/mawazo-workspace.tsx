"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  StoreIcon,
  PencilIcon,
  Trash2Icon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  XIcon,
  ImageIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SaveIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { User } from "@/core/auth/types";

interface Product {
  id: string;
  slug: string;
  name: string;
  desc: string;
  details: string;
  price_cents: number | null;
  compare_at_cents: number | null;
  status: "active" | "draft" | "hidden";
  featured: number;
  badge: string;
  category: string;
  collections: string[];
  images: string[];
  sizes: string[];
  colors: string[];
  fabric: string;
  care: string;
  meta_title: string;
  meta_desc: string;
}

const EMPTY: Product = {
  id: "",
  slug: "",
  name: "",
  desc: "",
  details: "",
  price_cents: null,
  compare_at_cents: null,
  status: "active",
  featured: 0,
  badge: "",
  category: "",
  collections: [],
  images: [],
  sizes: ["XS", "S", "M", "L", "XL"],
  colors: [],
  fabric: "Natural linen",
  care: "Cold wash gentle cycle, lay flat to dry, iron while slightly damp.",
  meta_title: "",
  meta_desc: "",
};

function fmtPrice(cents: number | null): string {
  if (cents == null) return "—";
  return "$" + (cents / 100).toFixed(2);
}
function parsePrice(s: string): number | null {
  if (!s.trim()) return null;
  const n = Math.round(parseFloat(s.replace(/[$,\s]/g, "")) * 100);
  return Number.isFinite(n) ? n : null;
}
function splitList(s: string): string[] {
  return s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
}

function field(label: string, value: string, onChange: (v: string) => void, placeholder = "") {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function MawazoWorkspace({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mawazo/products", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: products.length, active: 0, draft: 0, hidden: 0 };
    for (const p of products) if (p.status in c) c[p.status as keyof typeof c]++;
    return c;
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return products.filter((p) => {
      if (tab !== "all" && p.status !== tab) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, query, tab]);

  const openNew = () => {
    setEditing({ ...EMPTY, name: "", slug: "" });
    setIsNew(true);
  };
  const openEdit = (p: Product) => {
    setEditing(JSON.parse(JSON.stringify(p)));
    setIsNew(false);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const url = "/api/mawazo/products" + (isNew ? "" : "/" + editing.id);
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Save failed");
      }
      setEditing(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? This removes it from the live site.`)) return;
    try {
      const res = await fetch("/api/mawazo/products/" + p.id, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  const setField = (k: keyof Product, v: unknown) => {
    setEditing((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            MAWAZO Store Ops
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage every piece on mawazobydagiova.com — edits publish instantly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://mawazobydagiova.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <StoreIcon className="h-4 w-4" /> View live site <ExternalLinkIcon className="h-3 w-3" />
          </a>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCwIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openNew}>
            <PlusIcon className="h-4 w-4" /> New Piece
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss"><XIcon className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["all", "active", "draft", "hidden"] as const).map((k) => (
          <Card key={k}>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold">{counts[k]}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {k === "all" ? "Total pieces" : k === "active" ? "Live on site" : k === "draft" ? "Drafts" : "Hidden"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search pieces…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="hidden">Hidden</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1 rounded-md border">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            <Loader2Icon className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No pieces found. Create your first one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background/95 backdrop-blur">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Piece</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Featured</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-8 shrink-0 overflow-hidden rounded bg-muted">
                        {p.images?.[0] ? (
                          <img
                            src={p.images[0]}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-4 w-4 m-auto mt-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted-foreground">/{p.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <UiBadge
                      variant={p.status === "active" ? "default" : "secondary"}
                      className={
                        p.status === "active"
                          ? "bg-emerald-600 hover:bg-emerald-600"
                          : p.status === "draft"
                            ? "bg-amber-500/20 text-amber-700 hover:bg-amber-500/20"
                            : ""
                      }
                    >
                      {p.status === "active" ? (
                        <><EyeIcon className="h-3 w-3" /> Live</>
                      ) : p.status === "draft" ? (
                        <><PencilIcon className="h-3 w-3" /> Draft</>
                      ) : (
                        <><EyeOffIcon className="h-3 w-3" /> Hidden</>
                      )}
                    </UiBadge>
                  </td>
                  <td className="px-4 py-2.5">{fmtPrice(p.price_cents)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.category || "—"}</td>
                  <td className="px-4 py-2.5">
                    {p.featured ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label="Edit">
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(p)} aria-label="Delete">
                        <Trash2Icon className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Piece" : "Edit Piece"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                {field("Name *", editing.name, (v) => setField("name", v), "The Urithi Statesman Set")}
                {field("Slug", editing.slug, (v) => setField("slug", v), "urithi-statesman-set")}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-muted-foreground">Price (USD)</span>
                  <Input
                    value={editing.price_cents == null ? "" : fmtPrice(editing.price_cents).replace("$", "")}
                    placeholder="240.00"
                    onChange={(e) => setField("price_cents", parsePrice(e.target.value))}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-muted-foreground">Compare-at</span>
                  <Input
                    value={editing.compare_at_cents == null ? "" : fmtPrice(editing.compare_at_cents).replace("$", "")}
                    placeholder="300.00"
                    onChange={(e) => setField("compare_at_cents", parsePrice(e.target.value))}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-muted-foreground">Status</span>
                  <select
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                    value={editing.status}
                    onChange={(e) => setField("status", e.target.value)}
                  >
                    <option value="active">Active (live)</option>
                    <option value="draft">Draft</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("Badge", editing.badge, (v) => setField("badge", v), "New / Bestseller / Pre-order")}
                {field("Category", editing.category, (v) => setField("category", v), "The Suit Edit")}
              </div>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-muted-foreground">Short description (grid + PDP hero)</span>
                <textarea
                  className="min-h-[64px] rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={editing.desc}
                  onChange={(e) => setField("desc", e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-muted-foreground">Details (PDP accordion)</span>
                <textarea
                  className="min-h-[72px] rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={editing.details}
                  onChange={(e) => setField("details", e.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-muted-foreground">Images (one per line — paths or URLs)</span>
                  <textarea
                    className="min-h-[72px] rounded-md border bg-transparent px-3 py-2 text-sm"
                    value={(editing.images ?? []).join("\n")}
                    onChange={(e) => setField("images", splitList(e.target.value))}
                  />
                </label>
                <div className="grid gap-3">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-muted-foreground">Sizes (comma or line separated)</span>
                    <textarea
                      className="min-h-[36px] rounded-md border bg-transparent px-3 py-2 text-sm"
                      value={(editing.sizes ?? []).join(", ")}
                      onChange={(e) => setField("sizes", splitList(e.target.value))}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-muted-foreground">Fabric</span>
                    <Input
                      value={editing.fabric}
                      onChange={(e) => setField("fabric", e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-muted-foreground">Care instructions</span>
                <textarea
                  className="min-h-[48px] rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={editing.care}
                  onChange={(e) => setField("care", e.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("SEO title", editing.meta_title, (v) => setField("meta_title", v))}
                {field("SEO description", editing.meta_desc, (v) => setField("meta_desc", v))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!editing.featured}
                  onChange={(e) => setField("featured", e.target.checked ? 1 : 0)}
                  className="h-4 w-4"
                />
                Featured (shows first in grid)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !editing?.name}>
              {saving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <SaveIcon className="h-4 w-4" />}
              {isNew ? "Create & Publish" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
