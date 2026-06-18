"use client";

import { useEffect, useMemo, useState } from "react";

// Approx centroids for Indian states + UTs, keyed by ISO 3166-2 sub-region
// codes that Google Trends returns (IN-DL, IN-MH, ...).
const STATE_CENTROIDS: Record<string, { lat: number; lng: number; name: string }> = {
  "IN-AP": { lat: 15.91, lng: 79.74, name: "Andhra Pradesh" },
  "IN-AR": { lat: 28.22, lng: 94.73, name: "Arunachal Pradesh" },
  "IN-AS": { lat: 26.2, lng: 92.94, name: "Assam" },
  "IN-BR": { lat: 25.1, lng: 85.31, name: "Bihar" },
  "IN-CT": { lat: 21.28, lng: 81.87, name: "Chhattisgarh" },
  "IN-CG": { lat: 21.28, lng: 81.87, name: "Chhattisgarh" },
  "IN-GA": { lat: 15.3, lng: 74.12, name: "Goa" },
  "IN-GJ": { lat: 22.26, lng: 71.19, name: "Gujarat" },
  "IN-HR": { lat: 29.06, lng: 76.09, name: "Haryana" },
  "IN-HP": { lat: 31.1, lng: 77.17, name: "Himachal Pradesh" },
  "IN-JH": { lat: 23.61, lng: 85.28, name: "Jharkhand" },
  "IN-KA": { lat: 15.32, lng: 75.71, name: "Karnataka" },
  "IN-KL": { lat: 10.85, lng: 76.27, name: "Kerala" },
  "IN-MP": { lat: 22.97, lng: 78.66, name: "Madhya Pradesh" },
  "IN-MH": { lat: 19.75, lng: 75.71, name: "Maharashtra" },
  "IN-MN": { lat: 24.66, lng: 93.91, name: "Manipur" },
  "IN-ML": { lat: 25.47, lng: 91.37, name: "Meghalaya" },
  "IN-MZ": { lat: 23.16, lng: 92.94, name: "Mizoram" },
  "IN-NL": { lat: 26.16, lng: 94.56, name: "Nagaland" },
  "IN-OD": { lat: 20.95, lng: 85.1, name: "Odisha" },
  "IN-OR": { lat: 20.95, lng: 85.1, name: "Odisha" },
  "IN-PB": { lat: 31.15, lng: 75.34, name: "Punjab" },
  "IN-RJ": { lat: 27.02, lng: 74.22, name: "Rajasthan" },
  "IN-SK": { lat: 27.53, lng: 88.51, name: "Sikkim" },
  "IN-TN": { lat: 11.13, lng: 78.66, name: "Tamil Nadu" },
  "IN-TG": { lat: 18.11, lng: 79.02, name: "Telangana" },
  "IN-TS": { lat: 18.11, lng: 79.02, name: "Telangana" },
  "IN-TR": { lat: 23.94, lng: 91.99, name: "Tripura" },
  "IN-UP": { lat: 26.85, lng: 80.95, name: "Uttar Pradesh" },
  "IN-UT": { lat: 30.07, lng: 79.02, name: "Uttarakhand" },
  "IN-UK": { lat: 30.07, lng: 79.02, name: "Uttarakhand" },
  "IN-WB": { lat: 22.99, lng: 87.86, name: "West Bengal" },
  // Union Territories
  "IN-AN": { lat: 11.74, lng: 92.65, name: "Andaman & Nicobar" },
  "IN-CH": { lat: 30.74, lng: 76.78, name: "Chandigarh" },
  "IN-DH": { lat: 20.18, lng: 73.02, name: "Dadra & Nagar Haveli" },
  "IN-DD": { lat: 20.71, lng: 70.95, name: "Daman & Diu" },
  "IN-DL": { lat: 28.7, lng: 77.1, name: "Delhi" },
  "IN-JK": { lat: 33.78, lng: 76.58, name: "Jammu & Kashmir" },
  "IN-LA": { lat: 34.16, lng: 77.58, name: "Ladakh" },
  "IN-LD": { lat: 10.57, lng: 72.64, name: "Lakshadweep" },
  "IN-PY": { lat: 11.94, lng: 79.81, name: "Puducherry" },
};

// India bounding box for projection (rough)
const BBOX = { latMin: 6.5, latMax: 36.0, lngMin: 67.5, lngMax: 97.5 };

function project(lat: number, lng: number, W: number, H: number): { x: number; y: number } {
  const x = ((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * W;
  const y = ((BBOX.latMax - lat) / (BBOX.latMax - BBOX.latMin)) * H;
  return { x, y };
}

export type DemandRow = {
  query: string;
  regions: Array<{ geo: string; location: string; value: number }>;
};

type Props = {
  data: DemandRow[];
  loading?: boolean;
};

export function DemandMap({ data, loading }: Props) {
  const [activeQuery, setActiveQuery] = useState(0);

  // Reset active query when the dataset changes
  useEffect(() => {
    setActiveQuery(0);
  }, [data.length]);

  const current = data[activeQuery];
  const W = 720;
  const H = 700;

  const dots = useMemo(() => {
    if (!current) return [];
    const max = Math.max(1, ...current.regions.map((r) => r.value));
    return current.regions
      .map((r) => {
        const c = STATE_CENTROIDS[r.geo];
        if (!c) return null;
        const { x, y } = project(c.lat, c.lng, W, H);
        const intensity = r.value / max;
        return {
          geo: r.geo,
          name: c.name,
          value: r.value,
          x,
          y,
          intensity,
          radius: 6 + intensity * 22,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [current]);

  const topRegions = useMemo(
    () =>
      current ? [...current.regions].sort((a, b) => b.value - a.value).slice(0, 8) : [],
    [current]
  );

  if (loading && !current) {
    return (
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 animate-pulse">
        <div className="h-[520px] rounded bg-[color:var(--surface-elevated)]" />
      </div>
    );
  }
  if (!current) {
    return (
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center text-[12px] text-[color:var(--text-tertiary)]">
        No demand data captured for these keywords yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-black/55 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute h-[1px] w-full bg-gradient-to-r from-transparent via-[#facc15]/30 to-transparent"
      />
      {/* Tabs across queries */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-[color:var(--border)] overflow-x-auto">
        {data.map((row, i) => (
          <button
            key={row.query}
            onClick={() => setActiveQuery(i)}
            className={`shrink-0 h-7 px-3 rounded-md text-[11px] transition-colors ${
              i === activeQuery
                ? "bg-[#facc15] text-black font-medium"
                : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
            }`}
            style={
              i === activeQuery
                ? { boxShadow: "0 0 8px rgba(250,204,21,0.5)" }
                : undefined
            }
          >
            {row.query}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        <div className="md:col-span-2 relative min-h-[500px] border-b md:border-b-0 md:border-r border-[color:var(--border)]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <radialGradient id="demand-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#facc15" stopOpacity="0.95" />
                <stop offset="50%" stopColor="#facc15" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Subtle bbox grid */}
            <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <line key={`v${i}`} x1={(W / 8) * i} y1={0} x2={(W / 8) * i} y2={H} />
              ))}
              {Array.from({ length: 8 }).map((_, i) => (
                <line key={`h${i}`} x1={0} y1={(H / 8) * i} x2={W} y2={(H / 8) * i} />
              ))}
            </g>

            {/* India bounding label */}
            <text
              x="50%"
              y={H - 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.18)"
              fontFamily="monospace"
              fontSize="10"
            >
              India · search interest by state · {current.query}
            </text>

            {/* Glow dots */}
            {dots.map((d) => (
              <g key={d.geo}>
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={d.radius * 2.2}
                  fill="url(#demand-glow)"
                  opacity={0.55 + d.intensity * 0.45}
                />
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={d.radius}
                  fill="none"
                  stroke="#facc15"
                  strokeOpacity={0.7}
                  strokeWidth={0.8}
                />
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={Math.max(2.5, d.radius * 0.45)}
                  fill="#facc15"
                  style={{
                    filter:
                      "drop-shadow(0 0 4px #facc15) drop-shadow(0 0 8px rgba(250,204,21,0.55))",
                  }}
                />
                {/* Label top 5 dots */}
                {d.intensity > 0.5 && (
                  <text
                    x={d.x}
                    y={d.y - d.radius - 4}
                    textAnchor="middle"
                    fill="#facc15"
                    fontFamily="monospace"
                    fontSize="9"
                    style={{ textShadow: "0 0 4px rgba(250,204,21,0.6)" }}
                  >
                    {d.name} · {d.value}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>

        {/* Ranked list */}
        <div className="p-4 lg:p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
            Hot states
          </div>
          <div className="space-y-1">
            {topRegions.map((r, i) => {
              const max = topRegions[0]?.value || 100;
              const pct = (r.value / max) * 100;
              return (
                <div key={r.geo} className="flex items-center gap-2 text-[11px]">
                  <span className="text-[9px] font-mono text-[color:var(--text-tertiary)] w-4 text-right">
                    {i + 1}
                  </span>
                  <span className="text-[color:var(--text-secondary)] truncate flex-1">
                    {r.location}
                  </span>
                  <div className="w-16 h-[3px] rounded-full bg-[color:var(--surface-elevated)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: "#facc15",
                        boxShadow: "0 0 4px rgba(250,204,21,0.6)",
                      }}
                    />
                  </div>
                  <span
                    className="font-mono tabular-nums w-7 text-right"
                    style={{
                      color: "#facc15",
                      textShadow: "0 0 4px rgba(250,204,21,0.4)",
                    }}
                  >
                    {r.value}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-[color:var(--border)] text-[10px] font-mono text-[color:var(--text-tertiary)] leading-relaxed">
            Values normalised 0-100 within this query. A 100 in Delhi vs 30 in
            Tamil Nadu means Delhi has 3.3× the relative search interest right
            now — not 3.3× the volume.
          </div>
        </div>
      </div>
    </div>
  );
}
