"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Realtime = {
  active_users: number;
  hourly_avg: number;
  top_cities: Array<{ city: string; country: string; users: number }>;
  top_countries: Array<{ country: string; users: number }>;
  top_pages: Array<{ path: string; views: number }>;
  device_mix: Array<{ device: string; users: number }>;
  hourly_series: number[];
};

// City + country → approx lat/lng for plotting on the world map.
// Heavy on Indian cities (common for India-focused properties), plus
// the top global metros so non-India workspaces still light up.
const CITY_COORDS: Record<string, [number, number]> = {
  // ─── India ───
  "mumbai|india": [19.076, 72.877],
  "delhi|india": [28.704, 77.103],
  "new delhi|india": [28.614, 77.209],
  "bangalore|india": [12.972, 77.595],
  "bengaluru|india": [12.972, 77.595],
  "hyderabad|india": [17.385, 78.487],
  "chennai|india": [13.083, 80.27],
  "kolkata|india": [22.572, 88.364],
  "pune|india": [18.52, 73.857],
  "ahmedabad|india": [23.023, 72.572],
  "surat|india": [21.17, 72.831],
  "jaipur|india": [26.912, 75.788],
  "lucknow|india": [26.847, 80.947],
  "kanpur|india": [26.45, 80.331],
  "nagpur|india": [21.146, 79.088],
  "indore|india": [22.72, 75.857],
  "thane|india": [19.219, 72.978],
  "bhopal|india": [23.26, 77.413],
  "visakhapatnam|india": [17.687, 83.218],
  "vadodara|india": [22.307, 73.181],
  "ghaziabad|india": [28.669, 77.453],
  "ludhiana|india": [30.901, 75.857],
  "agra|india": [27.176, 78.008],
  "nashik|india": [19.997, 73.79],
  "faridabad|india": [28.408, 77.318],
  "meerut|india": [28.984, 77.706],
  "rajkot|india": [22.303, 70.802],
  "kalyan|india": [19.243, 73.135],
  "vasai|india": [19.388, 72.83],
  "varanasi|india": [25.317, 82.973],
  "srinagar|india": [34.083, 74.797],
  "aurangabad|india": [19.876, 75.343],
  "dhanbad|india": [23.795, 86.43],
  "amritsar|india": [31.634, 74.872],
  "navi mumbai|india": [19.033, 73.029],
  "allahabad|india": [25.435, 81.847],
  "ranchi|india": [23.344, 85.31],
  "howrah|india": [22.595, 88.262],
  "coimbatore|india": [11.017, 76.956],
  "jabalpur|india": [23.181, 79.987],
  "gwalior|india": [26.218, 78.183],
  "vijayawada|india": [16.506, 80.648],
  "jodhpur|india": [26.238, 73.024],
  "madurai|india": [9.939, 78.121],
  "raipur|india": [21.251, 81.629],
  "kochi|india": [9.932, 76.267],
  "chandigarh|india": [30.733, 76.78],
  "guwahati|india": [26.144, 91.736],
  "mysore|india": [12.295, 76.639],
  "thiruvananthapuram|india": [8.524, 76.937],
  "noida|india": [28.535, 77.391],
  "gurgaon|india": [28.458, 77.029],
  "gurugram|india": [28.458, 77.029],
  // ─── International ───
  "new york|united states": [40.713, -74.006],
  "los angeles|united states": [34.052, -118.244],
  "chicago|united states": [41.878, -87.63],
  "san francisco|united states": [37.775, -122.419],
  "seattle|united states": [47.606, -122.332],
  "boston|united states": [42.36, -71.058],
  "austin|united states": [30.267, -97.743],
  "miami|united states": [25.762, -80.192],
  "toronto|canada": [43.653, -79.383],
  "vancouver|canada": [49.283, -123.121],
  "london|united kingdom": [51.507, -0.128],
  "manchester|united kingdom": [53.481, -2.243],
  "dublin|ireland": [53.35, -6.26],
  "paris|france": [48.857, 2.351],
  "berlin|germany": [52.52, 13.405],
  "munich|germany": [48.135, 11.582],
  "amsterdam|netherlands": [52.367, 4.904],
  "madrid|spain": [40.417, -3.704],
  "rome|italy": [41.903, 12.496],
  "stockholm|sweden": [59.329, 18.069],
  "warsaw|poland": [52.23, 21.012],
  "moscow|russia": [55.756, 37.617],
  "istanbul|turkey": [41.009, 28.978],
  "dubai|united arab emirates": [25.205, 55.271],
  "abu dhabi|united arab emirates": [24.453, 54.377],
  "riyadh|saudi arabia": [24.713, 46.675],
  "doha|qatar": [25.286, 51.531],
  "tel aviv|israel": [32.085, 34.781],
  "cairo|egypt": [30.044, 31.236],
  "lagos|nigeria": [6.524, 3.379],
  "nairobi|kenya": [-1.292, 36.821],
  "johannesburg|south africa": [-26.205, 28.05],
  "cape town|south africa": [-33.925, 18.424],
  "tokyo|japan": [35.69, 139.692],
  "osaka|japan": [34.694, 135.502],
  "seoul|south korea": [37.566, 126.978],
  "shanghai|china": [31.23, 121.474],
  "beijing|china": [39.904, 116.407],
  "hong kong|hong kong": [22.319, 114.169],
  "taipei|taiwan": [25.033, 121.565],
  "singapore|singapore": [1.352, 103.82],
  "kuala lumpur|malaysia": [3.139, 101.687],
  "jakarta|indonesia": [-6.208, 106.846],
  "bangkok|thailand": [13.756, 100.501],
  "manila|philippines": [14.599, 120.984],
  "ho chi minh city|vietnam": [10.823, 106.629],
  "hanoi|vietnam": [21.028, 105.854],
  "karachi|pakistan": [24.861, 67.01],
  "lahore|pakistan": [31.55, 74.343],
  "dhaka|bangladesh": [23.811, 90.413],
  "colombo|sri lanka": [6.927, 79.861],
  "kathmandu|nepal": [27.717, 85.324],
  "sydney|australia": [-33.868, 151.209],
  "melbourne|australia": [-37.814, 144.963],
  "auckland|new zealand": [-36.848, 174.762],
  "sao paulo|brazil": [-23.55, -46.633],
  "rio de janeiro|brazil": [-22.907, -43.173],
  "buenos aires|argentina": [-34.604, -58.382],
  "lima|peru": [-12.046, -77.043],
  "santiago|chile": [-33.448, -70.673],
  "bogota|colombia": [4.711, -74.072],
  "mexico city|mexico": [19.433, -99.133],
};

// Country centroid fallback when we don't know the city.
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  india: [22.0, 79.0],
  "united states": [39.0, -98.0],
  "united kingdom": [54.0, -2.0],
  canada: [56.0, -106.0],
  germany: [51.0, 10.0],
  france: [46.0, 2.0],
  spain: [40.0, -4.0],
  italy: [42.0, 12.0],
  australia: [-25.0, 134.0],
  japan: [36.0, 138.0],
  "south korea": [36.0, 128.0],
  china: [35.0, 105.0],
  singapore: [1.3, 103.8],
  "united arab emirates": [24.0, 54.0],
  brazil: [-14.0, -55.0],
  mexico: [23.0, -102.0],
  pakistan: [30.0, 70.0],
  bangladesh: [24.0, 90.0],
  philippines: [13.0, 122.0],
  indonesia: [-5.0, 120.0],
  vietnam: [16.0, 108.0],
  thailand: [15.0, 100.0],
  malaysia: [4.0, 102.0],
  "saudi arabia": [25.0, 45.0],
  russia: [62.0, 94.0],
  turkey: [39.0, 35.0],
  egypt: [27.0, 30.0],
  nigeria: [10.0, 8.0],
  "south africa": [-30.0, 25.0],
  netherlands: [52.0, 5.0],
  sweden: [62.0, 15.0],
  norway: [62.0, 10.0],
  poland: [52.0, 19.0],
  ireland: [53.0, -8.0],
};

function coordsFor(city: string, country: string): [number, number] | null {
  const k = `${city.toLowerCase()}|${country.toLowerCase()}`;
  if (CITY_COORDS[k]) return CITY_COORDS[k];
  const c = COUNTRY_CENTROIDS[country.toLowerCase()];
  if (c) return c;
  return null;
}

// Equirectangular projection: lat/lng → (x, y) in a 0..1 normalised box.
function project(lat: number, lng: number): { x: number; y: number } {
  const x = (lng + 180) / 360;
  const y = (90 - lat) / 180;
  return { x, y };
}

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#7c6bff",
  desktop: "#a78bfa",
  tablet: "#cfcfcf",
  smarttv: "#facc15",
  console: "#facc15",
  wearable: "#facc15",
  unknown: "#94a3b8",
};

export function RealtimeOverview() {
  const [data, setData] = useState<Realtime | null>(null);
  const [pulse, setPulse] = useState(false);
  const lastTotalRef = useRef<number>(0);
  // Activity ticker — synthetic events derived from top_pages, with timestamps
  // so we can roll older lines out the top of the panel.
  const [ticker, setTicker] = useState<
    Array<{ id: number; path: string; ts: number }>
  >([]);
  const tickerIdRef = useRef(1);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const res = await fetch("/api/dashboard/realtime", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const next = (await res.json()) as Realtime;
        setData((prev) => {
          if (prev && next.active_users !== prev.active_users) {
            setPulse(true);
            setTimeout(() => setPulse(false), 700);
          }
          return next;
        });
        lastTotalRef.current = next.active_users;
      } catch {
        /* ignore */
      }
    }
    tick();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, 15_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  // Synthetic per-second ticker — weighted random samples from top_pages so it
  // *feels* live between 15s refreshes. Capped so older entries fade out.
  useEffect(() => {
    if (!data || data.top_pages.length === 0) return;
    const pool = data.top_pages;
    const total = pool.reduce((s, p) => s + p.views, 0);
    if (total === 0) return;
    const interval = setInterval(() => {
      // Weighted pick
      let r = Math.random() * total;
      let pick = pool[0];
      for (const p of pool) {
        r -= p.views;
        if (r <= 0) {
          pick = p;
          break;
        }
      }
      const id = tickerIdRef.current++;
      const now = Date.now();
      setTicker((prev) => [{ id, path: pick.path, ts: now }, ...prev].slice(0, 14));
    }, 950 + Math.random() * 600);
    return () => clearInterval(interval);
  }, [data]);

  const cityDots = useMemo(() => {
    if (!data) return [];
    const maxUsers = Math.max(1, ...data.top_cities.map((c) => c.users));
    return data.top_cities
      .map((c) => {
        const coords = coordsFor(c.city, c.country);
        if (!coords) return null;
        const [lat, lng] = coords;
        const { x, y } = project(lat, lng);
        const intensity = c.users / maxUsers;
        return {
          city: c.city,
          country: c.country,
          users: c.users,
          x,
          y,
          radius: 3 + intensity * 7,
          intensity,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [data]);

  const delta = data ? data.active_users - data.hourly_avg : 0;
  const deltaPct = data && data.hourly_avg > 0
    ? Math.round((delta / data.hourly_avg) * 100)
    : 0;

  return (
    <div className="relative rounded-xl border border-[color:var(--border)] bg-black/60 overflow-hidden">
      {/* Ambient glow background */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 size-[420px] rounded-full opacity-30 blur-[100px]"
        style={{ background: "radial-gradient(closest-side, #7c6bff, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 size-[440px] rounded-full opacity-20 blur-[120px]"
        style={{ background: "radial-gradient(closest-side, #a78bfa, transparent 70%)" }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-0">
        {/* Hero counter + tiles */}
        <div className="p-6 lg:p-7 lg:border-r border-[color:var(--border)] flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
              <span
                className="size-1.5 rounded-full neon-pulse"
                style={{
                  background: "#7c6bff",
                  boxShadow: "0 0 6px #7c6bff, 0 0 12px rgba(124,107,255,0.6)",
                }}
              />
              Active right now
            </div>
            <div
              className={`mt-3 font-mono tabular-nums font-medium text-[64px] leading-none ${
                pulse ? "neon-pulse" : ""
              }`}
              style={{
                color: "#7c6bff",
                textShadow:
                  "0 0 12px rgba(124,107,255,0.6), 0 0 32px rgba(124,107,255,0.35)",
              }}
            >
              {data ? data.active_users.toLocaleString("en-IN") : "—"}
            </div>
            <div className="mt-2 flex items-baseline gap-2 text-[12px] font-mono">
              <span className="text-[color:var(--text-tertiary)]">vs avg</span>
              <span className="text-[color:var(--text-secondary)]">
                {data?.hourly_avg.toLocaleString("en-IN") ?? "…"}/hr
              </span>
              {data && data.hourly_avg > 0 && (
                <span
                  style={{
                    color: delta >= 0 ? "#7c6bff" : "#cfcfcf",
                    textShadow:
                      delta >= 0
                        ? "0 0 4px rgba(124,107,255,0.5)"
                        : "0 0 4px rgba(244,114,182,0.5)",
                  }}
                >
                  {delta >= 0 ? "+" : ""}
                  {deltaPct}%
                </span>
              )}
            </div>
          </div>

          {/* Hourly sparkline */}
          <Sparkline series={data?.hourly_series ?? []} color="#7c6bff" />

          {/* Devices */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
              Devices
            </div>
            <div className="space-y-1.5">
              {(data?.device_mix ?? []).slice(0, 5).map((d) => {
                const color = DEVICE_COLORS[d.device.toLowerCase()] ?? "#94a3b8";
                const totalDevices = (data?.device_mix ?? []).reduce(
                  (s, x) => s + x.users,
                  0
                );
                const pct = totalDevices > 0 ? (d.users / totalDevices) * 100 : 0;
                return (
                  <div key={d.device} className="flex items-center gap-2">
                    <span
                      className="text-[11px] capitalize"
                      style={{
                        color,
                        textShadow: `0 0 4px ${color}80`,
                      }}
                    >
                      {d.device}
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-[color:var(--surface-elevated)] relative overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${color}55, ${color})`,
                          boxShadow: `0 0 6px ${color}, 0 0 14px ${color}66`,
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-mono tabular-nums shrink-0 w-12 text-right"
                      style={{ color }}
                    >
                      {d.users.toLocaleString("en-IN")}
                    </span>
                  </div>
                );
              })}
              {(!data || data.device_mix.length === 0) && (
                <div className="text-[11px] text-[color:var(--text-tertiary)]">
                  …
                </div>
              )}
            </div>
          </div>

          {/* Top countries */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
              Top countries
            </div>
            <div className="space-y-1">
              {(data?.top_countries ?? []).slice(0, 5).map((c, i) => {
                const max = Math.max(
                  1,
                  ...(data?.top_countries.map((x) => x.users) ?? [1])
                );
                const pct = (c.users / max) * 100;
                return (
                  <div
                    key={c.country}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <span className="text-[9px] font-mono text-[color:var(--text-tertiary)] w-4 text-right">
                      {i + 1}
                    </span>
                    <span className="text-[color:var(--text-secondary)] truncate flex-1">
                      {c.country}
                    </span>
                    <div className="w-20 h-[3px] rounded-full bg-[color:var(--surface-elevated)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: "#7c6bff",
                          boxShadow: "0 0 4px #7c6bff",
                        }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-[#7c6bff] w-10 text-right">
                      {c.users.toLocaleString("en-IN")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Map — center panel, biggest visual */}
        <div className="lg:col-span-1 relative min-h-[420px] border-b lg:border-b-0 border-[color:var(--border)]">
          <WorldDotMap dots={cityDots} />
          {data && data.top_cities.length > 0 && (
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5 pointer-events-none">
              {data.top_cities.slice(0, 6).map((c) => (
                <span
                  key={`${c.city}-${c.country}`}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                  style={{
                    color: "#7c6bff",
                    background: "rgba(0,0,0,0.5)",
                    borderColor: "rgba(124,107,255,0.35)",
                    textShadow: "0 0 4px rgba(124,107,255,0.6)",
                  }}
                >
                  {c.city} · {c.users}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Live activity ticker */}
        <div className="p-6 lg:p-7 lg:border-l border-[color:var(--border)] flex flex-col">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] mb-3">
            <span
              className="size-1.5 rounded-full neon-pulse"
              style={{
                background: "#facc15",
                boxShadow: "0 0 6px #facc15, 0 0 12px rgba(250,204,21,0.6)",
              }}
            />
            Live activity
          </div>
          <div className="flex-1 relative overflow-hidden">
            <div className="space-y-1">
              {ticker.length === 0 && (
                <div className="text-[11px] text-[color:var(--text-tertiary)] font-mono">
                  waiting for events…
                </div>
              )}
              {ticker.map((ev, i) => {
                const age = (Date.now() - ev.ts) / 1000;
                const opacity = Math.max(0.2, 1 - i * 0.08);
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 text-[11px] font-mono"
                    style={{ opacity }}
                  >
                    <span
                      className="shrink-0 size-1.5 rounded-full"
                      style={{
                        background: i === 0 ? "#facc15" : "#94a3b8",
                        boxShadow:
                          i === 0
                            ? "0 0 6px #facc15, 0 0 12px rgba(250,204,21,0.6)"
                            : "none",
                      }}
                    />
                    <span className="text-[color:var(--text-tertiary)] shrink-0 w-10 text-right tabular-nums">
                      {age < 1 ? "now" : `${Math.floor(age)}s`}
                    </span>
                    <span
                      className="truncate flex-1"
                      style={{
                        color: i === 0 ? "#facc15" : "rgba(255,255,255,0.78)",
                      }}
                    >
                      {ev.path}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Fade-out gradient at bottom */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
              style={{
                background:
                  "linear-gradient(to bottom, transparent, rgba(0,0,0,0.85))",
              }}
            />
          </div>

          {/* Top pages summary */}
          <div className="mt-4 pt-4 border-t border-[color:var(--border)]">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
              Top pages (15 min)
            </div>
            <div className="space-y-1">
              {(data?.top_pages ?? []).slice(0, 5).map((p, i) => (
                <div
                  key={`${p.path}-${i}`}
                  className="flex items-center gap-2 text-[11px] font-mono"
                >
                  <span className="text-[9px] text-[color:var(--text-tertiary)] w-4 text-right">
                    {i + 1}
                  </span>
                  <span className="text-[color:var(--text-secondary)] truncate flex-1">
                    {p.path}
                  </span>
                  <span
                    className="tabular-nums shrink-0"
                    style={{
                      color: "#facc15",
                      textShadow: "0 0 4px rgba(250,204,21,0.45)",
                    }}
                  >
                    {p.views.toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (series.length === 0) {
    return (
      <div className="h-16 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] flex items-center justify-center text-[10px] font-mono text-[color:var(--text-tertiary)]">
        gathering 24h…
      </div>
    );
  }
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const W = 260;
  const H = 64;
  const step = W / Math.max(1, series.length - 1);
  const points = series
    .map((v, i) => `${(i * step).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`)
    .join(" ");
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-1">
        Last 24h
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="url(#spark-fill)"
          stroke="none"
          points={`0,${H} ${points} ${W},${H}`}
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
          style={{
            filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 8px ${color}55)`,
          }}
        />
      </svg>
    </div>
  );
}

function WorldDotMap({
  dots,
}: {
  dots: Array<{
    city: string;
    country: string;
    users: number;
    x: number;
    y: number;
    radius: number;
    intensity: number;
  }>;
}) {
  const W = 720;
  const H = 420;
  // Crop the map to roughly 60° south → 75° north and full 360° lng so dots
  // don't bunch up at the bottom of the viewport. Adjust the y mapping:
  // y_norm ∈ [0,1] from 90°N to 90°S; we display 75°N (y=15/180) to 60°S (y=150/180).
  const yMin = 15 / 180; // 75°N
  const yMax = 150 / 180; // 60°S
  const adjust = (y: number) => (y - yMin) / (yMax - yMin);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="dot-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7c6bff" stopOpacity="1" />
          <stop offset="40%" stopColor="#7c6bff" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#7c6bff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Grid */}
      <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={`v${i}`} x1={(W / 12) * i} y1={0} x2={(W / 12) * i} y2={H} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={(H / 7) * i} x2={W} y2={(H / 7) * i} />
        ))}
      </g>
      <line
        x1={0}
        y1={H / 2}
        x2={W}
        y2={H / 2}
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={1}
        strokeDasharray="3 4"
      />

      {/* Dots */}
      {dots.map((d, i) => {
        const px = d.x * W;
        const py = adjust(d.y) * H;
        return (
          <g key={`${d.city}-${i}`}>
            {/* Outer glow halo */}
            <circle
              cx={px}
              cy={py}
              r={d.radius * 3.5}
              fill="url(#dot-glow)"
              opacity={0.5 + d.intensity * 0.4}
              className="neon-dot-halo"
              style={{ animationDelay: `${(i % 6) * 0.18}s` }}
            />
            {/* Pulsing ring */}
            <circle
              cx={px}
              cy={py}
              r={d.radius}
              fill="none"
              stroke="#7c6bff"
              strokeOpacity={0.7}
              strokeWidth={0.8}
              className="neon-dot-ring"
              style={{ animationDelay: `${(i % 4) * 0.35}s` }}
            />
            {/* Solid core */}
            <circle
              cx={px}
              cy={py}
              r={Math.max(1.6, d.radius * 0.55)}
              fill="#7c6bff"
              style={{
                filter: "drop-shadow(0 0 4px #7c6bff) drop-shadow(0 0 9px #7c6bff99)",
              }}
            />
          </g>
        );
      })}

      {/* Empty state */}
      {dots.length === 0 && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          fill="rgba(255,255,255,0.35)"
          fontFamily="monospace"
          fontSize="11"
        >
          waiting for location data…
        </text>
      )}
    </svg>
  );
}
