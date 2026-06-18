"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Megaphone,
  Users2,
  Network,
  Music2,
  ShoppingBag,
  CreditCard,
  Database,
  Mail,
  MessagesSquare,
  Sparkles,
  Activity,
  Layers,
  Briefcase,
  Send,
  type LucideIcon,
} from "lucide-react";

type Status = "connected" | "available" | "coming_soon";
type Category = "Analytics" | "Ads" | "Commerce" | "CRM" | "Engagement" | "Data";

type Connector = {
  id: string;
  name: string;
  category: Category;
  icon: LucideIcon;
  description: string;
  status: Status;
  badge?: string; // e.g. "2 properties attached"
  href?: string; // primary action target
};

export function ConnectorsGrid({
  ga4Count,
  adsCount,
  adsConfigured,
  moeCount,
  moeConfigured,
}: {
  ga4Count: number;
  adsCount: number;
  adsConfigured: boolean;
  moeCount: number;
  moeConfigured: boolean;
}) {
  const ga4: Connector = {
    id: "ga4",
    name: "Google Analytics 4",
    category: "Analytics",
    icon: BarChart3,
    description: "Sessions, users, events, conversions, attribution — the foundation.",
    status: ga4Count > 0 ? "connected" : "available",
    badge:
      ga4Count > 0
        ? `${ga4Count} ${ga4Count === 1 ? "property" : "properties"} attached`
        : undefined,
    href: ga4Count > 0 ? "/workspace" : "/properties",
  };
  const ads: Connector = {
    id: "google_ads",
    name: "Google Ads",
    category: "Ads",
    icon: Megaphone,
    description: "Campaigns, keywords, search terms, spend, real CAC vs GA4 reality.",
    status: adsCount > 0 ? "connected" : "available",
    badge:
      adsCount > 0
        ? `${adsCount} ${adsCount === 1 ? "account" : "accounts"} attached`
        : adsConfigured
        ? "Token set · not connected"
        : "Setup required",
    href: "/connect/google-ads?back=/connectors",
  };
  const moe: Connector = {
    id: "moengage",
    name: "MoEngage",
    category: "Engagement",
    icon: Send,
    description:
      "Push, email, SMS, in-app sends. Join campaign opens to GA4 sessions + Ads spend per UTM.",
    status: moeCount > 0 ? "connected" : "available",
    badge:
      moeCount > 0
        ? "Attached"
        : moeConfigured
        ? "Keys set · not attached"
        : "Paste API keys",
    href: "/connect/moengage?back=/connectors",
  };

  // Placeholders — shell only, all coming_soon.
  const placeholders: Connector[] = [
    {
      id: "meta_ads",
      name: "Meta Ads",
      category: "Ads",
      icon: Users2,
      description: "Facebook + Instagram campaigns, ad sets, creative-level performance.",
      status: "coming_soon",
    },
    {
      id: "linkedin_ads",
      name: "LinkedIn Ads",
      category: "Ads",
      icon: Network,
      description: "B2B campaigns, audiences, account-targeted spend.",
      status: "coming_soon",
    },
    {
      id: "tiktok_ads",
      name: "TikTok Ads",
      category: "Ads",
      icon: Music2,
      description: "Short-form ad performance and creator collaborations.",
      status: "coming_soon",
    },
    {
      id: "shopify",
      name: "Shopify",
      category: "Commerce",
      icon: ShoppingBag,
      description: "Orders, customers, products, inventory. Join to GA4 for full LTV math.",
      status: "coming_soon",
    },
    {
      id: "stripe",
      name: "Stripe",
      category: "Commerce",
      icon: CreditCard,
      description: "Real revenue, MRR, churn — the truth GA4 conversions estimate.",
      status: "coming_soon",
    },
    {
      id: "hubspot",
      name: "HubSpot",
      category: "CRM",
      icon: Briefcase,
      description: "B2B lead lifecycle: MQL → SQL → opportunity → closed-won.",
      status: "coming_soon",
    },
    {
      id: "salesforce",
      name: "Salesforce",
      category: "CRM",
      icon: Database,
      description: "Pipeline, deals, attribution beyond first-touch.",
      status: "coming_soon",
    },
    {
      id: "klaviyo",
      name: "Klaviyo",
      category: "Engagement",
      icon: Mail,
      description: "Email + SMS campaigns. Conversion per send, list-quality scoring.",
      status: "coming_soon",
    },
    {
      id: "intercom",
      name: "Intercom",
      category: "Engagement",
      icon: MessagesSquare,
      description: "Conversations, NPS, customer-health signals.",
      status: "coming_soon",
    },
    {
      id: "mixpanel",
      name: "Mixpanel",
      category: "Analytics",
      icon: Activity,
      description: "Product analytics — funnels, cohorts, behavioural events.",
      status: "coming_soon",
    },
    {
      id: "amplitude",
      name: "Amplitude",
      category: "Analytics",
      icon: Sparkles,
      description: "Product analytics alternative — same shape, different schema.",
      status: "coming_soon",
    },
    {
      id: "segment",
      name: "Segment",
      category: "Data",
      icon: Layers,
      description: "Customer data pipeline. One hub, many downstreams.",
      status: "coming_soon",
    },
  ];

  const all: Connector[] = [ga4, ads, moe, ...placeholders];

  const connected = all.filter((c) => c.status === "connected");
  const available = all.filter((c) => c.status === "available");
  const comingSoon = all.filter((c) => c.status === "coming_soon");

  return (
    <>
      <header className="mb-6 flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono">
            Connectors
          </div>
          <h1 className="font-mono text-[28px] font-medium tracking-[-0.02em] leading-[1.1] mt-1">
            Connect your stack
          </h1>
          <p className="text-[13px] text-[color:var(--text-secondary)] mt-1.5 max-w-[640px]">
            Every connector here feeds the agents and the dashboard. Add more sources to
            unlock cross-platform insights you can&apos;t get from any single tool.
          </p>
        </div>
      </header>

      {connected.length > 0 && (
        <Section label="Connected" count={connected.length}>
          {connected.map((c) => (
            <ConnectorCard key={c.id} connector={c} />
          ))}
        </Section>
      )}
      {available.length > 0 && (
        <Section label="Available" count={available.length}>
          {available.map((c) => (
            <ConnectorCard key={c.id} connector={c} />
          ))}
        </Section>
      )}
      <Section label="Coming soon" count={comingSoon.length}>
        {comingSoon.map((c) => (
          <ConnectorCard key={c.id} connector={c} />
        ))}
      </Section>
    </>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
          {label}
        </div>
        <div className="text-[10px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
          {count}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </section>
  );
}

function ConnectorCard({ connector }: { connector: Connector }) {
  const Icon = connector.icon;
  const isInteractive = connector.status !== "coming_soon" && !!connector.href;
  const statusStyle =
    connector.status === "connected"
      ? {
          color: "var(--severity-low)",
          background: "rgba(126, 170, 138, 0.12)",
        }
      : connector.status === "available"
      ? {
          color: "var(--text-primary)",
          background: "var(--surface-elevated)",
        }
      : {
          color: "var(--text-tertiary)",
          background: "var(--surface-elevated)",
        };

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="size-9 rounded-md flex items-center justify-center shrink-0"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <Icon
              strokeWidth={1.5}
              className="size-4 text-[color:var(--text-secondary)]"
            />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-[color:var(--text-primary)] truncate">
              {connector.name}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] mt-0.5">
              {connector.category}
            </div>
          </div>
        </div>
        {isInteractive && (
          <ArrowUpRight
            strokeWidth={1.5}
            className="size-3.5 text-[color:var(--text-tertiary)] shrink-0 opacity-0 group-hover:opacity-100 tx-hover"
          />
        )}
      </div>

      <p className="text-[12px] text-[color:var(--text-secondary)] leading-relaxed mb-3 min-h-[2.5em]">
        {connector.description}
      </p>

      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full"
          style={statusStyle}
        >
          {connector.status === "connected"
            ? "Connected"
            : connector.status === "available"
            ? "Available"
            : "Coming soon"}
        </span>
        {connector.badge && (
          <span className="text-[11px] font-mono text-[color:var(--text-tertiary)] tabular-nums truncate">
            {connector.badge}
          </span>
        )}
      </div>
    </>
  );

  const classes =
    "block rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 group" +
    (isInteractive
      ? " hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] tx-hover"
      : " opacity-70");

  if (isInteractive && connector.href) {
    return (
      <Link href={connector.href} className={classes}>
        {inner}
      </Link>
    );
  }
  return <div className={classes}>{inner}</div>;
}
