"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Megaphone,
  Plug,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

type Customer = {
  customer_id: string;
  display_name: string;
  currency: string | null;
  is_manager: boolean;
};

type StatusResponse =
  | {
      configured: false;
      hint: string;
      scope_granted?: false;
      customers?: never;
    }
  | {
      configured: true;
      scope_granted: false;
      customers: [];
      grant_url: string;
    }
  | {
      configured: true;
      scope_granted: true;
      customers: Customer[];
      error?: string;
    };

type Stage = "token" | "scope" | "pick" | "done";

export function ConnectAdsWizard({
  workspaceId,
  workspaceName,
  attachedAdsCustomerIds,
  backUrl,
  landingFromGrant,
}: {
  workspaceId: number;
  workspaceName: string;
  attachedAdsCustomerIds: string[];
  backUrl: string;
  landingFromGrant: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attaching, setAttaching] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Load current state (token + scope + customers).
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    (async () => {
      try {
        const res = await fetch("/api/sources/google-ads/customers");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(data);
        if (data.configured && data.scope_granted) {
          // Default-select customers not yet attached.
          const next = new Set<string>();
          for (const c of data.customers) {
            if (!attachedAdsCustomerIds.includes(c.customer_id) && !c.is_manager) {
              next.add(c.customer_id);
            }
          }
          setSelected(next);
        }
      } catch {
        // soft-fail
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachedAdsCustomerIds, reloadKey]);

  // Determine current stage.
  const stage: Stage = useMemo(() => {
    if (!status) return "token";
    if (!status.configured) return "token";
    if (!status.scope_granted) return "scope";
    // If we have at least one customer already attached, allow user to either
    // attach more or treat as done. Default to "pick" so they can confirm.
    return "pick";
  }, [status]);

  // If we just came back from the grant flow, briefly show a success line.
  const [justGranted, setJustGranted] = useState(landingFromGrant);
  useEffect(() => {
    if (!justGranted) return;
    const t = setTimeout(() => setJustGranted(false), 3000);
    return () => clearTimeout(t);
  }, [justGranted]);

  async function attach() {
    if (!status || !status.scope_granted) return;
    const picks = status.customers.filter((c) => selected.has(c.customer_id));
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
            account_email: "",
          })),
        }),
      });
      if (res.ok) {
        // Land on /dashboard with the Paid view ready to populate.
        router.push(backUrl + (backUrl.includes("?") ? "&" : "?") + "view=paid");
        router.refresh();
      }
    } finally {
      setAttaching(false);
    }
  }

  return (
    <>
      {/* Header */}
      <header className="mb-8 flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <Link
            href={backUrl}
            className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover mb-2"
          >
            <ArrowLeft strokeWidth={1.5} className="size-3" />
            Back
          </Link>
          <h1 className="font-mono text-[28px] font-medium tracking-[-0.02em] leading-[1.1] flex items-center gap-2.5">
            <Megaphone strokeWidth={1.5} className="size-6 text-[color:var(--text-secondary)]" />
            Connect Google Ads
          </h1>
          <p className="text-[13px] text-[color:var(--text-secondary)] mt-1.5 max-w-[520px]">
            Unlock the Paid + Unified dashboard views, the Google Ads reports section,
            and Vera the Budget Strategist. Attaching to <strong>{workspaceName}</strong>.
          </p>
        </div>
      </header>

      {/* Stepper */}
      <StepRail stage={stage} />

      {justGranted && (
        <div
          className="rounded-md px-3 py-2 mb-4 text-[12px] flex items-center gap-2"
          style={{
            background: "rgba(126, 170, 138, 0.08)",
            border: "1px solid rgba(126, 170, 138, 0.2)",
            color: "var(--severity-low)",
          }}
        >
          <CheckCircle2 strokeWidth={1.5} className="size-4" />
          Scope granted. Pick which Ads accounts to attach below.
        </div>
      )}

      {/* Stage content */}
      {!status ? (
        <SkeletonCard />
      ) : stage === "token" ? (
        <TokenSetup
          hint={(status as { configured: false; hint: string }).hint}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      ) : stage === "scope" ? (
        <ScopeGrant grantUrl={(status as { grant_url: string }).grant_url} />
      ) : (
        <CustomerPicker
          customers={(status as { customers: Customer[] }).customers}
          selected={selected}
          setSelected={setSelected}
          attachedAdsCustomerIds={attachedAdsCustomerIds}
          onAttach={attach}
          onReGrant={() => {
            window.location.href = `/api/auth/connect-ads?back=${encodeURIComponent(`/connect/google-ads?back=${backUrl}`)}`;
          }}
          attaching={attaching}
          onRefresh={() => setReloadKey((k) => k + 1)}
          error={"error" in status ? status.error : undefined}
        />
      )}
    </>
  );
}

function StepRail({ stage }: { stage: Stage }) {
  const order: Stage[] = ["token", "scope", "pick"];
  const labels: Record<Stage, string> = {
    token: "Developer token",
    scope: "Grant scope",
    pick: "Attach accounts",
    done: "Done",
  };
  const idx = order.indexOf(stage);
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.06em] mb-6">
      {order.map((s, i) => {
        const isPast = i < idx;
        const isCurrent = i === idx;
        return (
          <div key={s} className="flex items-center gap-2">
            <span
              className="size-5 rounded-full flex items-center justify-center text-[10px] font-mono"
              style={{
                background: isPast || isCurrent ? "var(--text-primary)" : "var(--surface-elevated)",
                color: isPast || isCurrent ? "var(--bg)" : "var(--text-tertiary)",
                border: "1px solid var(--border-strong)",
              }}
            >
              {isPast ? "✓" : i + 1}
            </span>
            <span
              className={
                isCurrent
                  ? "text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-tertiary)]"
              }
            >
              {labels[s]}
            </span>
            {i < order.length - 1 && (
              <span className="text-[color:var(--text-tertiary)] mx-1">·</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 animate-pulse">
      <div className="h-4 w-48 rounded bg-[color:var(--surface-elevated)]" />
      <div className="h-3 w-72 mt-3 rounded bg-[color:var(--surface-elevated)]" />
      <div className="h-3 w-56 mt-2 rounded bg-[color:var(--surface-elevated)]" />
      <div className="h-8 w-32 mt-5 rounded bg-[color:var(--surface-elevated)]" />
    </div>
  );
}

function TokenSetup({
  hint,
  onSaved,
}: {
  hint: string;
  onSaved: () => void;
}) {
  const [token, setToken] = useState("");
  const [loginCid, setLoginCid] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/sources/google-ads/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          login_customer_id: loginCid.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
      <h2 className="font-mono text-[18px] font-medium mb-2">
        Step 1 — Paste your Google Ads developer token
      </h2>
      <p className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed">
        {hint}
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <label className="text-[11px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] block mb-1.5">
            Developer token
          </label>
          <div className="flex items-center gap-2">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ABCdEf-12345_GhIjKlMnOpQ"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 h-9 px-3 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[13px] font-mono text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--border-strong)]"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="h-9 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[11px] text-[color:var(--text-secondary)]"
              title={showToken ? "Hide" : "Show"}
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1.5">
            Stored in this app&apos;s local database, scoped to your account.
            Never sent anywhere except the Google Ads API.
          </p>
        </div>

        <div>
          <label className="text-[11px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] block mb-1.5">
            Login customer ID <span className="opacity-60">(optional, MCC only)</span>
          </label>
          <input
            type="text"
            value={loginCid}
            onChange={(e) => setLoginCid(e.target.value.replace(/[\s-]/g, ""))}
            placeholder="1234567890"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-9 px-3 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[13px] font-mono text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--border-strong)]"
          />
          <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1.5">
            Only required if you&apos;re querying child accounts through an MCC
            manager. Leave blank if your token lives on a direct Ads account.
          </p>
        </div>

        {err && (
          <div className="text-[12px]" style={{ color: "var(--severity-high)" }}>
            {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={!token.trim() || saving}
            className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
            ) : null}
            Save and continue
          </button>
          <a
            href="https://ads.google.com/aw/apicenter"
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] inline-flex items-center gap-1.5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          >
            Open API Center
            <ArrowRight strokeWidth={1.5} className="size-3" />
          </a>
        </div>
      </div>

      <details className="mt-5 group">
        <summary className="text-[11px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] cursor-pointer hover:text-[color:var(--text-primary)] tx-hover">
          How to get a developer token →
        </summary>
        <div className="mt-3 text-[12px] leading-relaxed text-[color:var(--text-secondary)] space-y-2">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Sign in to a <strong>Google Ads Manager (MCC) account</strong> at{" "}
              <a
                href="https://ads.google.com/aw/apicenter"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[color:var(--text-primary)]"
              >
                ads.google.com
              </a>
              . If you don&apos;t have an MCC,{" "}
              <a
                href="https://ads.google.com/intl/en_in/home/tools/manager-accounts/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[color:var(--text-primary)]"
              >
                create one
              </a>
              {" "}— it&apos;s free.
            </li>
            <li>
              Go to <strong>Tools → Setup → API Center</strong>, accept the terms,
              and click <strong>Apply for token</strong>.
            </li>
            <li>
              <strong>Test access</strong> works immediately (limited to test
              accounts). <strong>Basic / Standard access</strong> takes ~1 day to
              approve.
            </li>
            <li>Copy the token and paste it above.</li>
          </ol>
        </div>
      </details>
    </div>
  );
}

function ScopeGrant({ grantUrl }: { grantUrl: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
      <h2 className="font-mono text-[18px] font-medium mb-2">
        Step 2 — Grant Google Ads scope
      </h2>
      <p className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed">
        We&apos;ll add the <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-[color:var(--surface-elevated)]">adwords</code>{" "}
        read scope to your existing Google connection. Same account that&apos;s already
        connected for GA4 — one click, no new login.
      </p>
      <ul className="mt-4 space-y-1.5 text-[12px] text-[color:var(--text-secondary)]">
        <li className="flex items-center gap-2">
          <CheckCircle2 strokeWidth={1.5} className="size-3.5 text-[color:var(--text-tertiary)]" />
          Read-only — we never modify your campaigns
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 strokeWidth={1.5} className="size-3.5 text-[color:var(--text-tertiary)]" />
          You can revoke anytime in your Google Account settings
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 strokeWidth={1.5} className="size-3.5 text-[color:var(--text-tertiary)]" />
          Same Google account, same OAuth — no new tokens to manage
        </li>
      </ul>
      <div className="mt-5">
        <a
          href={grantUrl}
          className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[13px] font-medium inline-flex items-center gap-2"
        >
          <Plug strokeWidth={1.5} className="size-4" />
          Grant Google Ads access
        </a>
      </div>
    </div>
  );
}

function CustomerPicker({
  customers,
  selected,
  setSelected,
  attachedAdsCustomerIds,
  onAttach,
  onReGrant,
  attaching,
  onRefresh,
  error,
}: {
  customers: Customer[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  attachedAdsCustomerIds: string[];
  onAttach: () => void;
  onReGrant: () => void;
  attaching: boolean;
  onRefresh: () => void;
  error?: string;
}) {
  const newlyAttachable = customers.filter(
    (c) => !attachedAdsCustomerIds.includes(c.customer_id)
  );
  const alreadyAttached = customers.filter((c) =>
    attachedAdsCustomerIds.includes(c.customer_id)
  );

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
      <header className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-mono text-[18px] font-medium">
          Step 3 — Attach Ads accounts to this workspace
        </h2>
        <button
          onClick={onRefresh}
          className="text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover inline-flex items-center gap-1"
        >
          <RefreshCw strokeWidth={1.5} className="size-3" />
          Refresh
        </button>
      </header>

      {error && (
        <div
          className="rounded-md px-3 py-2 mb-4 text-[12px] flex items-center gap-2"
          style={{
            background: "rgba(208, 72, 72, 0.08)",
            border: "1px solid rgba(208, 72, 72, 0.2)",
            color: "var(--severity-high)",
          }}
        >
          <X strokeWidth={1.5} className="size-3.5" />
          {error}
        </div>
      )}

      {customers.length === 0 ? (
        <div className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed">
          We didn&apos;t see any Google Ads customers under this Google login. If you
          expected some, you may need to use the Google account that has access to
          your Ads, or grant the scope under that account.
          <div className="mt-3">
            <button
              onClick={onReGrant}
              className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px]"
            >
              Re-grant with a different account
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-[color:var(--text-secondary)] mb-3">
            Pick which Ads accounts to attach. We&apos;ll match their campaign UTMs
            to GA4 to compute real CAC and ROAS.
          </p>
          <ul className="space-y-1 max-h-[320px] overflow-y-auto">
            {newlyAttachable.map((c) => {
              const checked = selected.has(c.customer_id);
              return (
                <li key={c.customer_id}>
                  <label className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-[color:var(--surface-hover)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(c.customer_id);
                        else next.delete(c.customer_id);
                        setSelected(next);
                      }}
                      className="size-3.5 mt-0.5"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="text-[13px] text-[color:var(--text-primary)] truncate flex items-center gap-2">
                        {c.display_name}
                        {c.is_manager && (
                          <span className="text-[9px] font-mono uppercase tracking-[0.06em] px-1 py-0.5 rounded bg-[color:var(--surface-elevated)] text-[color:var(--text-tertiary)]">
                            MCC
                          </span>
                        )}
                      </span>
                      <span className="block text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
                        customers/{c.customer_id}
                        {c.currency ? ` · ${c.currency}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
            {alreadyAttached.length > 0 && (
              <>
                <li className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)]">
                  Already attached
                </li>
                {alreadyAttached.map((c) => (
                  <li key={c.customer_id}>
                    <div className="flex items-start gap-3 px-2 py-2 opacity-70">
                      <CheckCircle2
                        strokeWidth={1.5}
                        className="size-3.5 mt-0.5"
                        style={{ color: "var(--severity-low)" }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-[13px] text-[color:var(--text-primary)] truncate">
                          {c.display_name}
                        </span>
                        <span className="block text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
                          customers/{c.customer_id}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </>
            )}
          </ul>

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={onAttach}
              disabled={attaching || newlyAttachable.length === 0 || selected.size === 0}
              className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {attaching ? (
                <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
              ) : (
                <Sparkles strokeWidth={1.5} className="size-4" />
              )}
              {attaching
                ? "Attaching…"
                : `Attach ${selected.size} ${selected.size === 1 ? "account" : "accounts"}`}
            </button>
            <button
              onClick={onReGrant}
              className="h-9 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px]"
            >
              Use a different Google account
            </button>
          </div>
        </>
      )}
    </div>
  );
}
