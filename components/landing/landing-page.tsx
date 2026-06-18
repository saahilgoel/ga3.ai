"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Reveal } from "./reveal";
import { PixelFace, FACES } from "./pixel-face";

/* Monochrome, quant-terminal, pixel-graphics. No hue — the app's palette is
   already neutral grayscale, so we lean entirely on var(--text-*) + borders.
   "ink" = pure white for the rare emphasis. */
const INK = "#ffffff";
const LOGIN = "/api/auth/login";
const GITHUB = "https://github.com/saahilgoel/ga3.ai";

export function LandingPage() {
  return (
    <div className="relative min-h-dvh bg-[color:var(--bg)] text-[color:var(--text-primary)] overflow-x-hidden">
      <Grain />
      <Nav />
      <Hero />
      <TrustStrip />
      <Gripes />
      <QuotesWall />
      <Pillars />
      <FeatureRows />
      <Knowledge />
      <Compare />
      <HowItWorks />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------- chrome --- */

function Grain() {
  return <div aria-hidden className="lp-grain pointer-events-none fixed inset-0 z-[1] opacity-[0.02]" />;
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-200 ${
        scrolled
          ? "bg-[color:var(--bg)]/80 backdrop-blur border-b border-[color:var(--border)]"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-[1120px] mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        <Wordmark />
        <nav className="hidden md:flex items-center gap-8 font-mono text-[12px] uppercase tracking-[0.1em] text-[color:var(--text-secondary)]">
          {[
            ["Why", "#gripes"],
            ["Features", "#features"],
            ["GA4·GA3", "#compare"],
            ["FAQ", "#faq"],
          ].map(([label, href]) => (
            <a key={href} href={href} className="hover:text-[color:var(--text-primary)] tx-hover">
              {label}
            </a>
          ))}
          <a
            href={GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-[color:var(--text-primary)] tx-hover"
          >
            <span className="text-white">★</span> Star on GitHub
          </a>
        </nav>
        <a
          href={LOGIN}
          className="inline-flex items-center gap-2 h-9 px-4 bg-[color:var(--neon)] text-white neon-glow font-mono text-[12px] uppercase tracking-[0.06em] hover:bg-[color:var(--neon-bright)] tx-hover"
        >
          Connect <span aria-hidden>→</span>
        </a>
      </div>
    </header>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark-dark.svg" alt="GA3" width={22} height={22} className="block" />
      <span className="font-mono text-[15px] font-semibold tracking-[0.04em]">GA3</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--text-tertiary)]">.ai</span>
    </Link>
  );
}

/* ---- pixel chart primitives (SVG, crisp-edged, monochrome) ---- */

function PixelColumns({
  values,
  rows = 14,
  cell = 6,
  gap = 2,
  className = "",
}: {
  values: number[];
  rows?: number;
  cell?: number;
  gap?: number;
  className?: string;
}) {
  const max = Math.max(...values, 1);
  const step = cell + gap;
  const w = values.length * step - gap;
  const h = rows * step - gap;
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`w-full ${className}`} shapeRendering="crispEdges" preserveAspectRatio="none">
      {values.map((v, i) => {
        const lit = Math.max(1, Math.round((v / max) * rows));
        return Array.from({ length: rows }).map((_, r) => {
          const on = r < lit;
          const fill = !on ? "var(--surface-elevated)" : i === last ? INK : "var(--text-secondary)";
          return <rect key={`${i}-${r}`} x={i * step} y={(rows - 1 - r) * step} width={cell} height={cell} fill={fill} />;
        });
      })}
    </svg>
  );
}

function PixelSpark({ values, rows = 5, cell = 3, gap = 1 }: { values: number[]; rows?: number; cell?: number; gap?: number }) {
  const max = Math.max(...values, 1);
  const step = cell + gap;
  const w = values.length * step - gap;
  const h = rows * step - gap;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges">
      {values.map((v, i) => {
        const lit = Math.max(1, Math.round((v / max) * rows));
        return Array.from({ length: rows }).map((_, r) => (
          <rect
            key={`${i}-${r}`}
            x={i * step}
            y={(rows - 1 - r) * step}
            width={cell}
            height={cell}
            fill={r < lit ? "var(--text-primary)" : "var(--surface-hover)"}
          />
        ));
      })}
    </svg>
  );
}

/* dot-matrix "world" — dim grid + a few lit, pulsing cells */
const MAP_COLS = 26;
const MAP_ROWS = 11;
const LIT = new Set(["3,4", "5,6", "8,3", "10,5", "13,2", "15,7", "17,4", "19,6", "21,3", "23,5", "6,8", "12,8"]);

function DotMatrix({ height = 120 }: { height?: number }) {
  const cell = 3;
  const gap = 5;
  const step = cell + gap;
  const w = MAP_COLS * step - gap;
  const h = MAP_ROWS * step - gap;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ height }} className="w-full" shapeRendering="crispEdges" preserveAspectRatio="xMidYMid meet">
      {Array.from({ length: MAP_COLS }).map((_, c) =>
        Array.from({ length: MAP_ROWS }).map((_, r) => {
          const key = `${c},${r}`;
          const on = LIT.has(key);
          return (
            <rect
              key={key}
              x={c * step}
              y={r * step}
              width={cell}
              height={cell}
              fill={on ? INK : "var(--surface-elevated)"}
              opacity={on ? 1 : 0.7}
              style={on ? { animation: "softPulse 2.2s ease-in-out infinite", animationDelay: `${(c % 6) * 0.18}s` } : undefined}
            />
          );
        })
      )}
    </svg>
  );
}

/* --------------------------------------------------------------- hero --- */

function Hero() {
  return (
    <section className="relative z-10">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(var(--surface-hover) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 80% 55% at 50% 0%, #000 20%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 55% at 50% 0%, #000 20%, transparent 72%)",
          opacity: 0.6,
        }}
      />

      <div className="max-w-[1120px] mx-auto px-5 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
            <span className="inline-block h-1.5 w-1.5 bg-white" />
            In memory of Universal Analytics · 2005&ndash;2023
          </div>
        </Reveal>

        <Reveal delay={70}>
          <h1 className="mt-8 font-mono text-[34px] sm:text-[58px] leading-[1.05] font-semibold tracking-[-0.03em] max-w-[18ch] mx-auto text-[color:var(--text-secondary)]">
            <span className="text-[color:var(--text-primary)]">You don&rsquo;t hate your data.</span>
            <br />
            You hate{" "}
            <span className="text-white border-b-[3px] border-white pb-0.5">opening GA4.</span>
          </h1>
        </Reveal>

        <Reveal delay={140}>
          <p className="mt-7 max-w-xl mx-auto text-[15px] sm:text-[17px] leading-relaxed text-[color:var(--text-secondary)]">
            GA3 brings back the dashboard you could actually read &mdash; then lets you skip it
            and just <span className="text-[color:var(--text-primary)]">ask</span>. Real answers,
            real charts, plain English. From agents that learned your business.
          </p>
        </Reveal>

        <Reveal delay={210}>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={LOGIN}
              className="inline-flex items-center justify-center gap-2 h-12 px-7 bg-[color:var(--neon)] text-white neon-glow font-mono text-[13px] uppercase tracking-[0.06em] hover:bg-[color:var(--neon-bright)] active:scale-[0.98] transition"
            >
              Connect Google Analytics <span aria-hidden>→</span>
            </a>
            <a
              href="#compare"
              className="inline-flex items-center justify-center h-12 px-6 border border-[color:var(--border-strong)] font-mono text-[13px] uppercase tracking-[0.06em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-focus)] tx-hover"
            >
              GA4 vs GA3
            </a>
          </div>
        </Reveal>

        <Reveal delay={270}>
          <p className="mt-5 font-mono text-[11px] text-[color:var(--text-tertiary)]">
            read-only · 30-second setup · no tag manager certification required
          </p>
          <p className="mt-2 font-mono text-[11px] text-[color:var(--text-tertiary)]">
            open source · for research &amp; testing ·{" "}
            <a
              href={GITHUB}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-[color:var(--text-primary)] tx-hover"
            >
              <span className="text-white">★</span> star on GitHub ↗
            </a>
          </p>
        </Reveal>
      </div>

      {/* terminal mockup */}
      <div className="max-w-[1060px] mx-auto px-4 sm:px-6 pb-8">
        <Reveal delay={120} y={24}>
          <DashboardMock />
        </Reveal>
      </div>
    </section>
  );
}

const KPIS = [
  { label: "SESSIONS", value: "48,210", delta: "+14.2%", up: true, spark: [3, 4, 4, 5, 5, 6, 7, 8] },
  { label: "USERS", value: "31,544", delta: "+9.1%", up: true, spark: [3, 3, 4, 4, 5, 5, 6, 6] },
  { label: "REVENUE", value: "₹3.24L", delta: "+6.8%", up: true, spark: [2, 3, 3, 4, 4, 5, 5, 6] },
  { label: "CONV.RATE", value: "3.1%", delta: "-2.4%", up: false, spark: [6, 6, 5, 5, 4, 4, 3, 3] },
];

const HERO_SERIES = [4, 5, 4, 6, 5, 7, 6, 8, 5, 9, 7, 10, 8, 11, 9, 12, 10, 13, 11, 14, 12, 15, 13, 16];

function DashboardMock() {
  const [live, setLive] = useState(248);
  useEffect(() => {
    const t = setInterval(() => setLive((n) => Math.max(180, n + Math.round((Math.random() - 0.5) * 14))), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="border border-[color:var(--border-strong)] bg-[color:var(--surface)]">
      {/* terminal title bar */}
      <div className="flex items-center gap-3 px-4 h-10 border-b border-[color:var(--border)] font-mono text-[11px] text-[color:var(--text-tertiary)]">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 bg-[color:var(--border-strong)]" />
          <span className="h-2 w-2 bg-[color:var(--border-strong)]" />
          <span className="h-2 w-2 bg-[color:var(--border-strong)]" />
        </div>
        <span className="text-[color:var(--text-secondary)]">ga3 ▸ overview</span>
        <span className="ml-auto">www.ga3.ai/dashboard</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] text-left">
        {/* sidebar */}
        <div className="hidden lg:flex flex-col gap-0.5 p-3 border-r border-[color:var(--border)] font-mono text-[12px]">
          {["overview", "realtime", "acquisition", "engagement", "monetisation", "retention"].map((n, i) => (
            <div key={n} className={`flex items-center gap-2 px-2 py-1.5 ${i === 0 ? "bg-[color:var(--surface-hover)] text-white" : "text-[color:var(--text-tertiary)]"}`}>
              <span className="h-1.5 w-1.5" style={{ background: i === 0 ? INK : "var(--border-strong)" }} />
              {n}
            </div>
          ))}
        </div>

        {/* main */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-mono">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-tertiary)]">overview</div>
              <div className="text-[18px] font-semibold tracking-[-0.01em] text-white">Last 14 days</div>
            </div>
            <div className="hidden sm:flex items-center gap-2 border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 h-9 font-mono text-[12px] text-[color:var(--text-secondary)]">
              <span className="text-white">&gt;_</span> ask anything about your data
              <span className="inline-block w-[7px] h-[14px] bg-white animate-pulse" />
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            {KPIS.map((k) => (
              <div key={k.label} className="border border-[color:var(--border)] bg-[color:var(--bg)] p-3">
                <div className="font-mono text-[10px] tracking-[0.08em] text-[color:var(--text-tertiary)]">{k.label}</div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <div className="font-mono text-[19px] font-semibold tabular-nums leading-none text-white">{k.value}</div>
                  <PixelSpark values={k.spark} />
                </div>
                <div className="mt-2 font-mono text-[11px] tabular-nums" style={{ color: k.up ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                  {k.up ? "▲" : "▼"} {k.delta}
                </div>
              </div>
            ))}
          </div>

          {/* chart + side */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-2">
            <div className="border border-[color:var(--border)] bg-[color:var(--bg)] p-3.5">
              <div className="flex items-center justify-between mb-2.5 font-mono">
                <span className="text-[12px] text-[color:var(--text-secondary)]">sessions</span>
                <span className="text-[11px] tabular-nums text-[color:var(--text-primary)]">▲ +14.2%</span>
              </div>
              <PixelColumns values={HERO_SERIES} rows={14} className="h-[140px]" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="border border-[color:var(--border)] bg-[color:var(--bg)] p-3">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)] mb-2">
                  <span>realtime</span>
                  <span className="tabular-nums text-white">{live} live</span>
                </div>
                <DotMatrix height={84} />
              </div>
              <div className="border border-[color:var(--border)] bg-[color:var(--bg)] p-3 font-mono text-[11px]">
                <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">maya · alert</div>
                <p className="mt-1.5 leading-snug text-[color:var(--text-primary)]">/pricing bounce 71% after deploy</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- trust strip --- */

function TrustStrip() {
  const items = ["read-only access", "no tags to install", "your data, never sold", "open source", "for research & testing"];
  return (
    <section className="relative z-10 border-y border-[color:var(--border)] bg-[color:var(--surface)]/30">
      <div className="max-w-[1120px] mx-auto px-5 sm:px-6 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[color:var(--text-secondary)]">
        {items.map((t) => (
          <div key={t} className="flex items-center gap-2">
            <span className="text-white">▪</span>
            {t}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- gripes --- */

const GRIPES: { t: string; d: string }[] = [
  { t: "Bounce rate? Gone. Then back. Then redefined.", d: "It's “engagement rate” now. Or the inverse of it. Pick a lane, Google." },
  { t: "To read a report, first build the report.", d: "Open Explore. Drag fourteen dimensions onto a blank canvas. Stare. Repeat tomorrow." },
  { t: "Your numbers don't add up — on purpose.", d: "Google “thresholded” the rows for your own privacy. The totals are a vibe now." },
  { t: "Real-time stopped feeling real-time.", d: "Some reports land 24–48 hours later, like a fax from a warehouse." },
  { t: "Conversion rate: 98.7%.", d: "Congratulations. Or — far more likely — a key event is misfiring and GA4 won't mention it." },
  { t: "Your top visitor is named (other).", d: "(other). (other). (other). Cardinality limits ate the rows that mattered." },
];

function Gripes() {
  return (
    <section id="gripes" className="relative z-10 max-w-[1120px] mx-auto px-5 sm:px-6 py-24 sm:py-32">
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] text-center">
          The five stages of opening GA4
        </p>
        <h2 className="mt-3 font-mono text-[26px] sm:text-[40px] leading-[1.1] font-semibold tracking-[-0.025em] text-center max-w-[22ch] mx-auto">
          Denial. Anger. <span className="text-white">Explore.</span> Bargaining. BigQuery.
        </h2>
        <p className="mt-4 text-center text-[15px] text-[color:var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
          Nobody chose this. Universal Analytics was switched off on 1 July 2023, and the
          replacement was built for analysts who enjoy data warehouses on weekends.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-[color:var(--border)]">
        {GRIPES.map((g, i) => (
          <Reveal key={g.t} delay={i * 50}>
            <div className="group h-full border-r border-b border-[color:var(--border)] p-5 hover:bg-[color:var(--surface)] tx-hover">
              <div className="font-mono text-[12px] mb-3 text-[color:var(--text-muted)] group-hover:text-white tx-hover">[0{i + 1}]</div>
              <h3 className="font-mono text-[14.5px] font-medium leading-snug tracking-[-0.01em]">{g.t}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">{g.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- quotes wall --- */

const QUOTES: { q: string; who: string }[] = [
  { q: "I've used Google Analytics for twelve years. I genuinely cannot find the bounce rate.", who: "Marketing lead, every agency" },
  { q: "Opened GA4. Closed GA4. Opened a spreadsheet.", who: "Solo founder, Tuesday morning" },
  { q: "It's not that it's hard. It's that it feels hard on purpose.", who: "Paraphrasing roughly all of r/analytics" },
  { q: "I migrated because they deleted the old one. Not because I wanted to.", who: "Literally everyone, July 2023" },
];

function QuotesWall() {
  return (
    <section className="relative z-10 border-y border-[color:var(--border)] bg-[color:var(--surface)]/30">
      <div className="max-w-[1120px] mx-auto px-5 sm:px-6 py-20 sm:py-24">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] text-center">
            real reviews · lightly paraphrased · painfully accurate
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 border-t border-l border-[color:var(--border)]">
          {QUOTES.map((c, i) => (
            <Reveal key={c.who} delay={i * 60}>
              <figure className="h-full border-r border-b border-[color:var(--border)] p-6 sm:p-7 bg-[color:var(--bg)]">
                <blockquote className="text-[18px] sm:text-[21px] leading-snug tracking-[-0.01em]">
                  <span className="font-mono text-white">&ldquo;</span>
                  {c.q}
                  <span className="font-mono text-white">&rdquo;</span>
                </blockquote>
                <figcaption className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
                  &mdash; {c.who}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ pillars --- */

const PILLARS: { n: string; t: string; d: string }[] = [
  { n: "01", t: "The dashboard is back", d: "Sessions, users, top pages, channels, live visitors — laid out like 2019 and readable at a glance. No Explore. No setup. No blank canvas." },
  { n: "02", t: "Just ask", d: "Type the question, get the chart, the answer, and the “so what.” “Why did mobile conversion drop on Tuesday?” — it'll actually tell you." },
  { n: "03", t: "It knows your business", d: "GA3 reads your site, products, competitors and industry — so insights mention your checkout, your SKUs, your rivals. Not a generic template." },
];

function Pillars() {
  return (
    <section className="relative z-10 max-w-[1120px] mx-auto px-5 sm:px-6 py-24 sm:py-32">
      <Reveal>
        <h2 className="font-mono text-[26px] sm:text-[42px] leading-[1.08] font-semibold tracking-[-0.025em] text-center max-w-[20ch] mx-auto">
          Meet GA3. The dashboard you missed, with a brain it never had.
        </h2>
      </Reveal>
      <div className="mt-14 grid grid-cols-1 md:grid-cols-3 border-t border-l border-[color:var(--border)]">
        {PILLARS.map((p, i) => (
          <Reveal key={p.t} delay={i * 70}>
            <div className="h-full border-r border-b border-[color:var(--border)] p-6">
              <div className="font-mono text-[12px] text-white">[{p.n}]</div>
              <h3 className="mt-5 font-mono text-[18px] font-semibold tracking-[-0.01em]">{p.t}</h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-[color:var(--text-secondary)]">{p.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- features --- */

const FEATURES: { tag: string; t: string; d: string; visual: React.ReactNode }[] = [
  { tag: "Ask anything", t: "Your query builder is a sentence", d: "No dimensions to drag, no metrics to memorise. Ask in plain English and GA3 picks the report, runs it, draws it, and tells you what it means.", visual: <AskVisual /> },
  { tag: "Realtime", t: "The map is back. The actual map.", d: "GA4 gave you a table of cities. GA3 gives you the dot-matrix of live visitors you actually missed — who's on your site, where, right now.", visual: <MapVisual /> },
  { tag: "Morning briefing", t: "Open your laptop to a paragraph, not a project", d: "Every morning, a plain-English readout of what happened overnight — what moved, what's odd, what needs you. Built before you finish your coffee.", visual: <BriefingVisual /> },
  { tag: "Agents, not menus", t: "Named teammates who watch the numbers for you", d: "Each agent owns a slice — acquisition, conversion, retention, spend — and flags what changed before you think to ask. They learned your business during setup.", visual: <AgentsVisual /> },
];

function FeatureRows() {
  return (
    <section id="features" className="relative z-10 border-t border-[color:var(--border)]">
      <div className="max-w-[1120px] mx-auto px-5 sm:px-6">
        {FEATURES.map((f, i) => (
          <div key={f.tag} className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center py-16 sm:py-24 ${i > 0 ? "border-t border-[color:var(--border)]" : ""}`}>
            <Reveal className={i % 2 === 1 ? "lg:order-2" : ""}>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] mb-4 text-[color:var(--text-tertiary)]">
                <span className="text-white">▸</span> {f.tag}
              </div>
              <h3 className="font-mono text-[24px] sm:text-[32px] leading-[1.12] font-semibold tracking-[-0.02em] max-w-[18ch]">{f.t}</h3>
              <p className="mt-4 text-[15px] leading-relaxed text-[color:var(--text-secondary)] max-w-md">{f.d}</p>
            </Reveal>
            <Reveal delay={80} className={i % 2 === 1 ? "lg:order-1" : ""}>
              {f.visual}
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

function VisualFrame({ children }: { children: React.ReactNode }) {
  return <div className="border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-4">{children}</div>;
}

function AskVisual() {
  return (
    <VisualFrame>
      <div className="border border-[color:var(--border)] bg-[color:var(--bg)] p-4 space-y-3 text-[13px] font-mono">
        <div className="flex justify-end">
          <span className="border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] px-3 py-2 max-w-[80%]">why did revenue dip last Thursday?</span>
        </div>
        <div className="border-l-2 border-white pl-3 max-w-[94%] text-[color:var(--text-secondary)]">
          <p className="text-[color:var(--text-primary)]">checkout starts flat — mobile payment success fell to 71%.</p>
          <div className="mt-3">
            <PixelColumns values={[6, 7, 6, 7, 3, 6, 7]} rows={8} className="h-14" />
          </div>
          <p className="mt-3 text-[12px]">one day, mobile only — likely a gateway timeout. worth a check.</p>
        </div>
      </div>
    </VisualFrame>
  );
}

function MapVisual() {
  return (
    <VisualFrame>
      <div className="border border-[color:var(--border)] bg-[color:var(--bg)] p-4">
        <DotMatrix height={200} />
        <div className="mt-3 font-mono text-[11px] text-[color:var(--text-secondary)]">
          <span className="text-white">▪</span> 248 visitors live · 19 countries
        </div>
      </div>
    </VisualFrame>
  );
}

function BriefingVisual() {
  return (
    <VisualFrame>
      <div className="border border-[color:var(--border)] bg-[color:var(--bg)] p-5 text-[13px]">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-tertiary)]">good morning · 08:02</div>
        <p className="mt-3 leading-relaxed text-[color:var(--text-secondary)]">
          Sessions up <span className="font-mono text-[color:var(--text-primary)] tabular-nums">+14%</span> overnight, led by
          organic search. One thing to watch: <span className="font-mono text-white">/pricing</span> bounce climbed to 71% after
          yesterday&rsquo;s deploy. Revenue holding at <span className="font-mono text-[color:var(--text-primary)] tabular-nums">&#8377;3.2L</span>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px]">
          {["acq +14%", "pricing bounce ↑", "rev ₹3.2L"].map((t) => (
            <span key={t} className="border border-[color:var(--border)] px-2 py-1 text-[color:var(--text-secondary)]">{t}</span>
          ))}
        </div>
      </div>
    </VisualFrame>
  );
}

const AGENTS: [string, string, keyof typeof FACES][] = [
  ["Maya", "acquisition", "maya"],
  ["Arjun", "conversion", "arjun"],
  ["Priya", "retention", "priya"],
  ["Kabir", "spend", "kabir"],
];

function AgentsVisual() {
  return (
    <VisualFrame>
      <div className="grid grid-cols-2 gap-2">
        {AGENTS.map(([n, r, face]) => (
          <div
            key={n}
            className="flex items-center gap-2.5 border border-[color:var(--border)] bg-[color:var(--bg)] px-2.5 py-2.5"
          >
            <div className="shrink-0 grid place-items-center h-12 w-12 border border-[color:var(--border-strong)] bg-[color:var(--surface)]">
              <PixelFace rows={FACES[face]} size={38} />
            </div>
            <div className="min-w-0 font-mono">
              <div className="text-[12.5px] text-[color:var(--text-primary)] truncate">{n}</div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] truncate">{r}</div>
            </div>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------- knowledge --- */

const KNOWLEDGE_NODES: { label: string; x: number; y: number }[] = [
  { label: "SITE", x: 22, y: 16 },
  { label: "PRODUCTS", x: 78, y: 16 },
  { label: "REVIEWS", x: 13, y: 50 },
  { label: "INDUSTRY", x: 87, y: 50 },
  { label: "COMPETITORS", x: 27, y: 88 },
  { label: "AI VISIBILITY", x: 73, y: 88 },
];

function KnowledgeGraph() {
  return (
    <div className="relative h-[300px] w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {KNOWLEDGE_NODES.map((n) => (
          <line
            key={n.label}
            x1="50"
            y1="50"
            x2={n.x}
            y2={n.y}
            stroke="var(--border-focus)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 border border-white bg-[color:var(--bg)] px-3 py-2 text-center">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--text-tertiary)]">context</div>
        <div className="font-mono text-[12px] font-semibold text-white">YOUR BUSINESS</div>
      </div>
      {KNOWLEDGE_NODES.map((n) => (
        <div
          key={n.label}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--text-secondary)]"
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        >
          {n.label}
        </div>
      ))}
    </div>
  );
}

const KNOWLEDGE_CARDS: { t: string; d: string }[] = [
  { t: "Automatic RAG context", d: "On connect, GA3 crawls your site and products, embeds them, and retrieves the relevant slice into every answer. No prompt-stuffing, no setup." },
  { t: "Competitor tracking", d: "It auto-detects your real, category-aware competitors — then watches their positioning and ad creative so you're never blindsided." },
  { t: "AI visibility", d: "See how your brand shows up in AI Overviews and LLM answers — the new search surface that classic analytics can't see." },
];

function Knowledge() {
  return (
    <section className="relative z-10 border-t border-[color:var(--border)] bg-[color:var(--surface)]/30">
      <div className="max-w-[1120px] mx-auto px-5 sm:px-6 py-24 sm:py-32">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] text-center">
            Automated knowledge
          </p>
          <h2 className="mt-3 font-mono text-[26px] sm:text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-center max-w-[20ch] mx-auto">
            It does its homework before you ask.
          </h2>
          <p className="mt-4 text-center text-[15px] text-[color:var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
            The moment you connect, GA3 reads your site, products, competitors and industry
            and builds a living knowledge graph it retrieves from on every question (RAG). So
            answers cite <span className="text-[color:var(--text-primary)]">your</span> checkout,{" "}
            <span className="text-[color:var(--text-primary)]">your</span> SKUs,{" "}
            <span className="text-[color:var(--text-primary)]">your</span> rivals — not generic
            GA boilerplate.
          </p>
        </Reveal>

        <Reveal delay={90}>
          <div className="mt-12 mx-auto max-w-[640px] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-6 sm:p-8">
            <KnowledgeGraph />
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 border-t border-l border-[color:var(--border)]">
          {KNOWLEDGE_CARDS.map((c, i) => (
            <Reveal key={c.t} delay={i * 70}>
              <div className="h-full border-r border-b border-[color:var(--border)] bg-[color:var(--bg)] p-6">
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-white">0{i + 1}</div>
                <h3 className="mt-4 font-mono text-[16px] font-semibold tracking-[-0.01em]">{c.t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--text-secondary)]">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ compare --- */

const ROWS: { label: string; ga4: string; ga3: string }[] = [
  { label: "Reading a report", ga4: "Build it yourself in Explore", ga3: "It's already on screen" },
  { label: "Asking a question", ga4: "Learn the query builder", ga3: "Type it in English" },
  { label: "Bounce rate", ga4: "“Engagement rate, actually”", ga3: "Right there, where it was" },
  { label: "Real-time map", ga4: "A table of cities", ga3: "A live dot-matrix" },
  { label: "Data freshness", ga4: "1–2 days, sampled", ga3: "Live" },
  { label: "Onboarding", ga4: "A certification course", ga3: "30 seconds" },
  { label: "Knows your business", ga4: "No", ga3: "Reads your site + rivals" },
  { label: "Built for", ga4: "Analysts", ga3: "You" },
];

function Compare() {
  return (
    <section id="compare" className="relative z-10 border-t border-[color:var(--border)] bg-[color:var(--surface)]/30">
      <div className="max-w-[940px] mx-auto px-5 sm:px-6 py-24 sm:py-32">
        <Reveal>
          <h2 className="font-mono text-[26px] sm:text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-center">
            Same data. <span className="text-white">Opposite experience.</span>
          </h2>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-12 border border-[color:var(--border-strong)]">
            <div className="grid grid-cols-[1.1fr_1fr_1fr] bg-[color:var(--surface-elevated)] font-mono text-[12px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
              <div className="px-4 py-3" />
              <div className="px-4 py-3 border-l border-[color:var(--border)]">GA4</div>
              <div className="px-4 py-3 border-l border-[color:var(--border)] font-semibold text-white bg-[color:var(--surface-hover)]">GA3</div>
            </div>
            {ROWS.map((r, i) => (
              <div key={r.label} className={`grid grid-cols-[1.1fr_1fr_1fr] text-[13px] sm:text-[14px] ${i > 0 ? "border-t border-[color:var(--border)]" : ""}`}>
                <div className="px-4 py-3.5 font-mono text-[color:var(--text-secondary)]">{r.label}</div>
                <div className="px-4 py-3.5 border-l border-[color:var(--border)] text-[color:var(--text-muted)] line-through decoration-[color:var(--text-muted)]/50">{r.ga4}</div>
                <div className="px-4 py-3.5 border-l border-[color:var(--border)] text-white bg-[color:var(--surface)]">{r.ga3}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- how it works --- */

const STEPS: { k: string; t: string; d: string }[] = [
  { k: "1", t: "Connect Google Analytics", d: "One click, read-only. We request the minimum scope and literally cannot modify your data." },
  { k: "2", t: "GA3 learns your business", d: "While you grab coffee, it reads your site, products, competitors and industry — and builds the context." },
  { k: "3", t: "Open the dashboard. Ask anything.", d: "The view you missed, the answers you need, and a briefing waiting for you every morning." },
];

function HowItWorks() {
  return (
    <section className="relative z-10 max-w-[1120px] mx-auto px-5 sm:px-6 py-24 sm:py-32">
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] text-center">
          from GA4 prison to GA3 in under a minute
        </p>
        <h2 className="mt-3 font-mono text-[26px] sm:text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-center">
          Three steps. No tags. No PhD.
        </h2>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 md:grid-cols-3 border-t border-l border-[color:var(--border)]">
        {STEPS.map((s, i) => (
          <Reveal key={s.k} delay={i * 70}>
            <div className="h-full border-r border-b border-[color:var(--border)] p-6">
              <div className="grid place-items-center h-9 w-9 bg-white text-black font-mono text-[14px] font-semibold">{s.k}</div>
              <h3 className="mt-5 font-mono text-[16px] font-medium tracking-[-0.01em]">{s.t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--text-secondary)]">{s.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- faq --- */

const FAQS: { q: string; a: string }[] = [
  { q: "Is this made by Google?", a: "No. Lovingly unaffiliated. Google Analytics is Google's; the nostalgia is ours. The name GA3 is a wink at the version everyone misses." },
  { q: "Will it change anything in my analytics?", a: "It can't. GA3 requests read-only access to your Google Analytics data. There is no write path — we couldn't edit a single event if we tried." },
  { q: "Do I need to reinstall any tags?", a: "Nope. If GA4 is already collecting data on your site, GA3 can read it. No GTM surgery, no new snippets." },
  { q: "Where does my data live, and who sees it?", a: "Your analytics data is fetched on demand to answer your questions and never sold or shared. See our privacy policy for the full, boring, reassuring details." },
  { q: "Is GA3 a real product or an elaborate joke?", a: "The name is a joke. The product ships. Connect your account and you'll be asking questions in under a minute." },
];

function FAQ() {
  return (
    <section id="faq" className="relative z-10 border-t border-[color:var(--border)]">
      <div className="max-w-[820px] mx-auto px-5 sm:px-6 py-24 sm:py-32">
        <Reveal>
          <h2 className="font-mono text-[26px] sm:text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-center">
            Questions, reasonably asked
          </h2>
        </Reveal>
        <div className="mt-12 border-t border-[color:var(--border)]">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 40}>
              <details className="group border-b border-[color:var(--border)] py-5">
                <summary className="flex items-center justify-between cursor-pointer list-none text-[15.5px] font-mono font-medium tracking-[-0.01em]">
                  {f.q}
                  <span className="ml-4 text-[color:var(--text-tertiary)] transition-transform duration-200 group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-[14.5px] leading-relaxed text-[color:var(--text-secondary)] max-w-[64ch]">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ final cta --- */

function FinalCTA() {
  return (
    <section className="relative z-10 border-t border-[color:var(--border)] overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage: "radial-gradient(var(--surface-hover) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 60% 100% at 50% 120%, #000 25%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 100% at 50% 120%, #000 25%, transparent 70%)",
          opacity: 0.6,
        }}
      />
      <div className="max-w-[1120px] mx-auto px-5 sm:px-6 py-28 sm:py-36 text-center">
        <Reveal>
          <h2 className="font-mono text-[30px] sm:text-[52px] leading-[1.04] font-semibold tracking-[-0.03em] max-w-[20ch] mx-auto">
            Stop spelunking in Explore. Bring back the dashboard.
          </h2>
        </Reveal>
        <Reveal delay={90}>
          <div className="mt-10">
            <a
              href={LOGIN}
              className="inline-flex items-center justify-center gap-2 h-13 px-8 bg-[color:var(--neon)] text-white neon-glow font-mono text-[14px] uppercase tracking-[0.06em] hover:bg-[color:var(--neon-bright)] active:scale-[0.98] transition"
              style={{ height: "52px" }}
            >
              Connect Google Analytics <span aria-hidden>→</span>
            </a>
          </div>
          <p className="mt-5 font-mono text-[11px] text-[color:var(--text-tertiary)]">read-only · free while in early access</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- footer --- */

function Footer() {
  return (
    <footer className="relative z-10 border-t border-[color:var(--border)]">
      <div className="max-w-[1120px] mx-auto px-5 sm:px-6 py-12">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-3 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
              The Google Analytics dashboard you missed &mdash; rebuilt for the way you actually
              work, and the questions you actually ask.
            </p>
          </div>
          <div className="flex gap-14 font-mono text-[12px] uppercase tracking-[0.06em]">
            <div className="space-y-2.5">
              <div className="text-[10px] tracking-[0.16em] text-[color:var(--text-tertiary)]">Product</div>
              <a href="#features" className="block text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover">Features</a>
              <a href="#compare" className="block text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover">GA4·GA3</a>
              <a href="#faq" className="block text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover">FAQ</a>
              <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="block text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover">GitHub ↗</a>
            </div>
            <div className="space-y-2.5">
              <div className="text-[10px] tracking-[0.16em] text-[color:var(--text-tertiary)]">Legal</div>
              <Link href="/privacy" className="block text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover">Privacy</Link>
              <Link href="/terms" className="block text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover">Terms</Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[color:var(--border)] space-y-2">
          <p className="text-[11px] leading-relaxed text-[color:var(--text-tertiary)] max-w-[80ch]">
            Open-source (MIT) and provided for research and testing purposes.{" "}
            <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[color:var(--text-primary)] tx-hover">
              github.com/saahilgoel/ga3.ai
            </a>
          </p>
          <p className="text-[11px] leading-relaxed text-[color:var(--text-tertiary)] max-w-[80ch]">
            GA3 is an independent product and is not affiliated with, endorsed by, or sponsored
            by Google LLC. Google Analytics&trade; and GA4&trade; are trademarks of Google LLC.
            GA3 requests read-only access to your Google Analytics data and never modifies it.
          </p>
          <p className="font-mono text-[11px] text-[color:var(--text-muted)]">&copy; 2026 ga3.ai</p>
        </div>
      </div>
    </footer>
  );
}
