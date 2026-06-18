"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Plug,
  RefreshCw,
  Send,
  X,
} from "lucide-react";

type Status = {
  configured: boolean;
  app_id: string | null;
  masked_api_id: string | null;
  masked_api_key: string | null;
  data_center: string | null;
  data_centers: Array<{ id: string; label: string }>;
};

type TestResult = {
  ok: boolean;
  detail?: string;
  campaign_count?: number;
};

type Stage = "creds" | "test" | "attach" | "done";

export function MoEngageWizard({
  workspaceId,
  workspaceName,
  attachedAppIds,
  backUrl,
}: {
  workspaceId: number;
  workspaceName: string;
  attachedAppIds: string[];
  backUrl: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [appId, setAppId] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [dataCenter, setDataCenter] = useState("dc-01");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load current state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sources/moengage/settings");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Status;
        if (cancelled) return;
        setStatus(data);
        if (data.configured && data.app_id) {
          setAppId(data.app_id);
        }
        if (data.data_center) setDataCenter(data.data_center);
      } catch {
        /* soft-fail */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const credentialsKnown = !!status?.configured;
  const alreadyAttached =
    credentialsKnown && !!status?.app_id && attachedAppIds.includes(status.app_id);

  const stage: Stage = !credentialsKnown
    ? "creds"
    : !testResult
    ? "test"
    : !testResult.ok
    ? "test"
    : alreadyAttached
    ? "done"
    : "attach";

  async function save() {
    if (!appId.trim() || !apiId.trim() || !apiKey.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/sources/moengage/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          app_id: appId.trim(),
          data_api_id: apiId.trim(),
          data_api_key: apiKey.trim(),
          data_center: dataCenter,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      // Re-fetch to surface masked values.
      const s = await fetch("/api/sources/moengage/settings");
      if (s.ok) setStatus((await s.json()) as Status);
      setApiKey("");
      setApiId("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/sources/moengage/test", { method: "POST" });
      const data = (await res.json()) as TestResult;
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, detail: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function attach() {
    setAttaching(true);
    setErr(null);
    try {
      const res = await fetch("/api/sources/moengage/attach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      router.push(backUrl + (backUrl.includes("?") ? "&" : "?") + "moengage_attached=1");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAttaching(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect MoEngage credentials? Existing workspaces stay attached but stop returning data.")) {
      return;
    }
    await fetch("/api/sources/moengage/settings", { method: "DELETE" });
    setStatus(null);
    setTestResult(null);
    setAppId("");
    setApiId("");
    setApiKey("");
  }

  return (
    <>
      <header className="mb-8">
        <Link
          href={backUrl}
          className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover mb-2"
        >
          <ArrowLeft strokeWidth={1.5} className="size-3" />
          Back
        </Link>
        <h1 className="font-serif text-[28px] font-medium tracking-[-0.02em] leading-[1.1] flex items-center gap-2.5">
          <Send strokeWidth={1.5} className="size-6 text-[color:var(--text-secondary)]" />
          Connect MoEngage
        </h1>
        <p className="text-[13px] text-[color:var(--text-secondary)] mt-1.5 max-w-[560px]">
          Unlock cross-platform marketing intelligence — join MoEngage campaign
          sends + opens to GA4 sessions + Google Ads spend per UTM. Attaching
          to <strong>{workspaceName}</strong>.
        </p>
      </header>

      <StepRail stage={stage} />

      {/* Step 1: credentials */}
      <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 mb-4">
        <h2 className="font-serif text-[18px] font-medium mb-2 flex items-center gap-2">
          Step 1 — API credentials
          {credentialsKnown && (
            <span className="text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(126,170,138,0.12)", color: "var(--severity-low)" }}>
              Saved
            </span>
          )}
        </h2>
        <p className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed">
          Find these in MoEngage → <strong>Settings → APIs → DATA API Settings</strong>.
          Pick the data center your workspace lives on.
        </p>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="APP ID" hint="MoEngage workspace identifier">
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value.trim())}
              placeholder="P9XYZABC123"
              autoComplete="off"
              spellCheck={false}
              className="w-full h-9 px-3 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[13px] font-mono text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--border-strong)]"
            />
          </Field>
          <Field label="Data center" hint="Where your account lives">
            <select
              value={dataCenter}
              onChange={(e) => setDataCenter(e.target.value)}
              className="w-full h-9 px-2 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[13px] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
            >
              {(status?.data_centers ?? [
                { id: "dc-01", label: "DC-01 · Mumbai (India)" },
                { id: "dc-02", label: "DC-02 · US East" },
                { id: "dc-03", label: "DC-03 · Frankfurt (EU)" },
                { id: "dc-04", label: "DC-04 · Indonesia" },
              ]).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="DATA API ID" hint="REST API ID">
            <input
              type={show ? "text" : "password"}
              value={apiId}
              onChange={(e) => setApiId(e.target.value)}
              placeholder={
                credentialsKnown && status?.masked_api_id
                  ? `${status.masked_api_id} (paste to replace)`
                  : "Paste from MoEngage"
              }
              autoComplete="off"
              spellCheck={false}
              className="w-full h-9 px-3 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[13px] font-mono text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--border-strong)]"
            />
          </Field>
          <Field label="DATA API KEY" hint="REST API password">
            <input
              type={show ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                credentialsKnown && status?.masked_api_key
                  ? `${status.masked_api_key} (paste to replace)`
                  : "Paste from MoEngage"
              }
              autoComplete="off"
              spellCheck={false}
              className="w-full h-9 px-3 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[13px] font-mono text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--border-strong)]"
            />
          </Field>
        </div>

        {err && (
          <div className="mt-3 text-[12px]" style={{ color: "var(--severity-high)" }}>
            {err}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={save}
            disabled={
              saving ||
              (!appId.trim() ||
                (!credentialsKnown && (!apiId.trim() || !apiKey.trim())))
            }
            className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving && <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />}
            {credentialsKnown ? "Update credentials" : "Save credentials"}
          </button>
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="h-9 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px]"
          >
            {show ? "Hide" : "Show"}
          </button>
          {credentialsKnown && (
            <button
              onClick={disconnect}
              className="h-9 px-3 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--severity-high)] ml-auto"
            >
              Disconnect
            </button>
          )}
        </div>

        <details className="mt-5">
          <summary className="text-[11px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] cursor-pointer hover:text-[color:var(--text-primary)] tx-hover">
            Where do I find these? →
          </summary>
          <div className="mt-3 text-[12px] leading-relaxed text-[color:var(--text-secondary)] space-y-2">
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>Log in to your MoEngage dashboard.</li>
              <li>
                Go to <strong>Settings → APIs → DATA API Settings</strong> in the
                sidebar.
              </li>
              <li>
                Copy <strong>APP ID</strong> (top of the page),{" "}
                <strong>DATA API ID</strong>, and <strong>DATA API KEY</strong>.
              </li>
              <li>
                The data center is the prefix of your dashboard URL:
                {" "}<code className="font-mono">dashboard-01.moengage.com</code> → DC-01.
              </li>
            </ol>
            <a
              href="https://help.moengage.com/hc/en-us/articles/229675528-Data-APIs-Overview"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover"
            >
              MoEngage docs <ArrowUpRight strokeWidth={1.5} className="size-3" />
            </a>
          </div>
        </details>
      </section>

      {/* Step 2: test connection */}
      {credentialsKnown && (
        <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 mb-4">
          <h2 className="font-serif text-[18px] font-medium mb-2 flex items-center gap-2">
            Step 2 — Verify connection
            {testResult?.ok && (
              <span className="text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(126,170,138,0.12)", color: "var(--severity-low)" }}>
                Live
              </span>
            )}
          </h2>
          <p className="text-[13px] text-[color:var(--text-secondary)]">
            We&apos;ll hit MoEngage with the saved credentials and confirm they
            work. Nothing is written.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={test}
              disabled={testing}
              className="h-9 px-4 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {testing ? (
                <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
              ) : (
                <RefreshCw strokeWidth={1.5} className="size-4" />
              )}
              Test connection
            </button>
            {testResult?.ok && (
              <span className="text-[13px] text-[color:var(--severity-low)] inline-flex items-center gap-1.5">
                <CheckCircle2 strokeWidth={1.5} className="size-4" />
                Connected{testResult.campaign_count != null
                  ? ` · ${testResult.campaign_count} campaigns visible`
                  : ""}
              </span>
            )}
            {testResult && !testResult.ok && (
              <span className="text-[13px]" style={{ color: "var(--severity-high)" }}>
                <X strokeWidth={1.5} className="size-3.5 inline mr-1" />
                {testResult.detail || "Failed"}
              </span>
            )}
          </div>
        </section>
      )}

      {/* Step 3: attach to workspace */}
      {credentialsKnown && testResult?.ok && (
        <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 mb-4">
          <h2 className="font-serif text-[18px] font-medium mb-2 flex items-center gap-2">
            Step 3 — Attach to this workspace
            {alreadyAttached && (
              <span className="text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(126,170,138,0.12)", color: "var(--severity-low)" }}>
                Attached
              </span>
            )}
          </h2>
          <p className="text-[13px] text-[color:var(--text-secondary)]">
            Once attached, agents can call MoEngage tools and cross-reference
            campaign sends with GA4 + Google Ads in the same conversation.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={attach}
              disabled={attaching || alreadyAttached}
              className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {attaching ? (
                <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
              ) : (
                <Plug strokeWidth={1.5} className="size-4" />
              )}
              {alreadyAttached
                ? "Already attached"
                : `Attach to ${workspaceName}`}
            </button>
            {alreadyAttached && (
              <Link
                href={backUrl}
                className="h-9 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] inline-flex items-center gap-1.5"
              >
                Done <ArrowRight strokeWidth={1.5} className="size-3" />
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function StepRail({ stage }: { stage: Stage }) {
  const order: Stage[] = ["creds", "test", "attach"];
  const labels: Record<Stage, string> = {
    creds: "Credentials",
    test: "Verify",
    attach: "Attach",
    done: "Done",
  };
  const idx = stage === "done" ? order.length : order.indexOf(stage);
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
                background:
                  isPast || isCurrent ? "var(--text-primary)" : "var(--surface-elevated)",
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] block mb-1.5">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1.5">{hint}</p>
      )}
    </div>
  );
}
