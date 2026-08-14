"use client";

import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EarlyAccessModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called to close the modal */
  onClose: () => void;
  /** Called when the unlock succeeds */
  onUnlocked: () => void;
}

export function EarlyAccessModal({ open, onClose, onUnlocked }: EarlyAccessModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setCode("");
      setError("");
      setLoading(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!code.trim()) {
      setError("Please enter an access code");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/unlock?code=" + encodeURIComponent(code.trim()));
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid access code");
        return;
      }

      onUnlocked();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-white/40 hover:text-white/80 transition-colors"
          aria-label="Close"
        >
          <XIcon className="h-4 w-4" />
        </button>

        <h2 className="text-xl font-semibold text-white">Early Access</h2>
        <p className="mt-1 text-sm text-white/50">
          Enter your access code to continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Input
              type="text"
              placeholder="Access code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black hover:bg-white/90"
          >
            {loading ? "Verifying..." : "Unlock Access"}
          </Button>
        </form>
      </div>
    </div>
  );
}
