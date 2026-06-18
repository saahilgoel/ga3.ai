// Plain taglines — the wordmark is rendered separately, so these should NOT
// include "ga-chat —". The trenchcoat line is reserved for the 404 page only.
export const TAGLINES = [
  "your traffic, but talkable",
  "GA4 with the rough edges sanded off",
  "stop hunting, start asking",
  "the dashboard that talks back",
  "finally, a reason to look at analytics",
  "Maya, Arjun, Priya, Kabir, Raavi at your service",
];

export function pickTagline(now: Date = new Date()): string {
  const h = now.getHours();
  const m = now.getMinutes();
  const idx = (h * 60 + m) % TAGLINES.length;
  return TAGLINES[idx];
}

export function getBriefingLabel(now: Date = new Date()): string {
  const day = now.getDay();
  if (day === 1) return "✨ Monday Briefing — start your week strong";
  if (day === 5) return "✨ Friday Briefing — what should we ship next week?";
  return "✨ Daily Briefing";
}

export function getStalkerBadge(score: number): { emoji: string; label: string } {
  if (score >= 200) return { emoji: "🏆", label: "exploration" };
  if (score >= 50) return { emoji: "🔥", label: "exploration" };
  return { emoji: "", label: "exploration" };
}

export function loadStalkerScore(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem("ga-chat:stalker-score");
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

export function saveStalkerScore(score: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("ga-chat:stalker-score", String(score));
}
