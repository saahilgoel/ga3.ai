"use client";

import { useEffect, useState } from "react";
import { X, Link2, Check, Copy, Download, Globe, Loader2, Share2 } from "lucide-react";

// Modal for creating / copying / revoking a conversation's public share link.
// The link is a live, read-only view at /share/<token>; anyone with it can read
// the transcript until the owner revokes it.
export function ShareDialog({
  conversationId,
  open,
  onClose,
}: {
  conversationId: number;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setCopied(false);
    fetch(`/api/conversations/${conversationId}/share`)
      .then((r) => r.json())
      .then((d: { path?: string | null }) => {
        setUrl(d.path ? `${window.location.origin}${d.path}` : null);
      })
      .catch(() => setUrl(null))
      .finally(() => setLoading(false));
  }, [open, conversationId]);

  async function createLink() {
    setBusy(true);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/share`, {
        method: "POST",
      });
      const d: { path?: string } = await r.json();
      if (d.path) setUrl(`${window.location.origin}${d.path}`);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await fetch(`/api/conversations/${conversationId}/share`, {
        method: "DELETE",
      });
      setUrl(null);
      setCopied(false);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-[440px] rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }}
      >
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <Share2 strokeWidth={1.5} className="size-4 text-[color:var(--neon-bright)]" />
            <h2 className="font-mono text-[15px] font-semibold tracking-tight">
              Share this chat
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="size-7 grid place-items-center rounded-md text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] tx-hover"
          >
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>

        <p className="text-[12.5px] text-[color:var(--text-secondary)] leading-relaxed mb-4">
          {url
            ? "Anyone with this link can view a read-only copy of this conversation, including its charts. Revoke it any time."
            : "Create a public, read-only link to this conversation. You can revoke it any time."}
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)] font-mono py-3">
            <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
            Checking…
          </div>
        ) : url ? (
          <>
            <div className="flex items-center gap-2 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-2.5 py-2 mb-3">
              <Link2 strokeWidth={1.5} className="size-3.5 text-[color:var(--text-tertiary)] shrink-0" />
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-transparent font-mono text-[12px] text-[color:var(--text-secondary)] focus:outline-none"
              />
              <button
                onClick={copy}
                className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-mono tx-hover ${
                  copied
                    ? "bg-[color:var(--neon)] text-white"
                    : "border border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]"
                }`}
              >
                {copied ? (
                  <>
                    <Check strokeWidth={2} className="size-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy strokeWidth={1.5} className="size-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-mono text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover"
              >
                <Globe strokeWidth={1.5} className="size-3.5" />
                Open link
              </a>
              <button
                onClick={revoke}
                disabled={busy}
                className="text-[12px] font-mono text-[color:var(--severity-high)] hover:underline disabled:opacity-50"
              >
                {busy ? "Revoking…" : "Stop sharing"}
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={createLink}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md bg-[color:var(--neon)] text-white text-[13px] font-mono font-medium hover:opacity-90 tx-hover disabled:opacity-50 neon-glow"
          >
            {busy ? (
              <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
            ) : (
              <Link2 strokeWidth={1.5} className="size-4" />
            )}
            Create share link
          </button>
        )}

        <div className="mt-4 pt-4 border-t border-[color:var(--border)]">
          <button
            onClick={() => window.open(`/print/${conversationId}`, "_blank")}
            className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-md border border-[color:var(--border-strong)] text-[12px] font-mono text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] tx-hover"
          >
            <Download strokeWidth={1.5} className="size-3.5" />
            Download as PDF
          </button>
        </div>
      </div>
    </div>
  );
}
