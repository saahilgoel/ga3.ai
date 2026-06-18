"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Megaphone,
  Plug,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type Customer = {
  customer_id: string;
  display_name: string;
  currency: string | null;
  is_manager: boolean;
};

type Props = {
  workspaceId: number;
  // Sources already attached to this workspace
  attachedAdsCustomerIds: string[];
  accountEmail: string;
};

export function ConnectedSources({
  workspaceId,
  attachedAdsCustomerIds,
  accountEmail,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "not_configured"; hint: string }
    | { kind: "not_granted"; grant_url: string }
    | { kind: "ready"; customers: Customer[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(attachedAdsCustomerIds)
  );
  const [attaching, setAttaching] = useState(false);

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/sources/google-ads/customers");
      const d = await res.json();
      if (!d.configured) {
        setState({ kind: "not_configured", hint: d.hint });
        return;
      }
      if (!d.scope_granted) {
        setState({ kind: "not_granted", grant_url: d.grant_url });
        return;
      }
      setState({ kind: "ready", customers: d.customers });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }

  useEffect(() => {
    // Auto-load if we just came back from the OAuth callback.
    if (params.get("ads_grant") === "1") {
      load();
      // Drop the query param without a navigation
      const sp = new URLSearchParams(params.toString());
      sp.delete("ads_grant");
      const qs = sp.toString();
      router.replace(`/workspace${qs ? `?${qs}` : ""}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function attach() {
    if (state.kind !== "ready") return;
    const picks = state.customers.filter((c) => selected.has(c.customer_id));
    if (picks.length === 0) return;
    setAttaching(true);
    try {
      const res = await fetch("/api/sources/google-ads/attach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          customers: picks.map((c) => ({
            customer_id: c.customer_id,
            display_name: c.display_name,
            account_email: accountEmail,
          })),
        }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setAttaching(false);
    }
  }

  return (
    <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden mb-8">
      <header className="px-5 py-3 border-b border-[color:var(--border)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Megaphone
            strokeWidth={1.5}
            className="size-4 text-[color:var(--text-secondary)]"
          />
          <span className="font-serif text-[15px] font-medium">Google Ads</span>
          {attachedAdsCustomerIds.length > 0 && (
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(126, 170, 138, 0.12)",
                color: "var(--severity-low)",
              }}
            >
              <CheckCircle2 strokeWidth={2} className="size-3" />
              {attachedAdsCustomerIds.length} attached
            </span>
          )}
        </div>
        <button
          onClick={load}
          className="text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover inline-flex items-center gap-1"
        >
          <RefreshCw strokeWidth={1.5} className="size-3" />
          Refresh
        </button>
      </header>

      <div className="px-5 py-4">
        {state.kind === "loading" && (
          <div className="text-[12px] text-[color:var(--text-tertiary)] font-mono">
            Checking…
          </div>
        )}

        {state.kind === "not_configured" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-[12px]" style={{ color: "var(--severity-medium)" }}>
              <AlertTriangle strokeWidth={1.5} className="size-3.5 mt-0.5 shrink-0" />
              <span>{state.hint}</span>
            </div>
            <p className="text-[12px] text-[color:var(--text-tertiary)] leading-relaxed">
              Open the guided setup for step-by-step instructions on getting a Google Ads developer
              token and adding it to <code className="font-mono">.env.local</code>.
            </p>
            <a
              href="/connect/google-ads?back=/workspace"
              className="h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[12px] font-medium inline-flex items-center gap-1.5"
            >
              <Plug strokeWidth={1.5} className="size-3.5" />
              Guided setup
            </a>
          </div>
        )}

        {state.kind === "not_granted" && (
          <div className="space-y-3">
            <p className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed max-w-[640px]">
              Connect your Google Ads account to unlock the Paid + Unified dashboard views, the Google Ads
              reports section, and Vera the Budget Strategist. We&apos;ll add the <code className="font-mono text-[11px]">adwords</code> read scope to your existing Google connection — no new account login.
            </p>
            <div className="flex items-center gap-2">
              <a
                href="/connect/google-ads?back=/workspace"
                className="h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[12px] font-medium inline-flex items-center gap-1.5"
              >
                <Plug strokeWidth={1.5} className="size-3.5" />
                Connect Google Ads
              </a>
              <a
                href={state.grant_url}
                className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px]"
              >
                Quick grant
              </a>
            </div>
          </div>
        )}

        {state.kind === "ready" && (
          <div className="space-y-3">
            <div className="text-[12px] text-[color:var(--text-secondary)]">
              {state.customers.length === 0
                ? "No Google Ads accounts found under this Google login."
                : `Pick which Google Ads accounts to attach to this workspace.`}
            </div>
            {state.customers.length > 0 && (
              <ul className="space-y-1 max-h-[260px] overflow-y-auto">
                {state.customers.map((c) => {
                  const isAttached = attachedAdsCustomerIds.includes(c.customer_id);
                  const isChecked = selected.has(c.customer_id);
                  return (
                    <li key={c.customer_id}>
                      <label
                        className={`flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] cursor-pointer ${
                          isAttached ? "opacity-70" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isAttached}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(c.customer_id);
                            else next.delete(c.customer_id);
                            setSelected(next);
                          }}
                          className="size-3.5"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="text-[13px] text-[color:var(--text-primary)] truncate">
                            {c.display_name}
                          </span>
                          <span className="block text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
                            customers/{c.customer_id}
                            {c.currency ? ` · ${c.currency}` : ""}
                            {c.is_manager ? " · manager" : ""}
                          </span>
                        </span>
                        {isAttached && (
                          <span className="text-[10px] font-mono uppercase text-[color:var(--severity-low)]">
                            attached
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={attach}
                disabled={
                  attaching ||
                  state.customers.every((c) => attachedAdsCustomerIds.includes(c.customer_id)) ||
                  ![...selected].some((id) => !attachedAdsCustomerIds.includes(id))
                }
                className="h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[12px] font-medium disabled:opacity-40"
              >
                {attaching ? "Attaching…" : "Attach selected"}
              </button>
              <a
                href="/api/auth/connect-ads"
                className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] inline-flex items-center gap-1.5"
              >
                <Plug strokeWidth={1.5} className="size-3.5" />
                Re-grant scope
              </a>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="text-[12px]" style={{ color: "var(--severity-high)" }}>
            <X strokeWidth={1.5} className="size-3.5 inline mr-1" />
            {state.message}
          </div>
        )}
      </div>
    </section>
  );
}
