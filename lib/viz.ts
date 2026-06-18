import { z } from "zod";

// Flat schema with all branch fields optional. Anthropic's tool API requires a
// root-level `type: "object"` JSON Schema — `z.discriminatedUnion` produces
// `{anyOf: [...]}` at the root and gets rejected. The `kind` field selects the
// renderer; descriptions tell the model which other fields to include.
export const vizSchema = z.object({
  kind: z
    .enum(["bar", "line", "pie", "kpi", "table", "funnel"])
    .describe("Which visualization to render."),
  title: z.string().describe("Headline for the visualization."),
  caption: z.string().optional().describe("Optional one-line caption shown below."),
  // bar / line / pie data
  data: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
        secondary: z.number().optional(),
      })
    )
    .optional()
    .describe('Required for kind="bar", "line", "pie". secondary is for a second series (bar/line only).'),
  // kpi
  primary: z
    .object({
      label: z.string(),
      value: z.string(),
      change_pct: z.number().optional(),
      change_direction: z.enum(["up", "down", "flat"]).optional(),
    })
    .optional()
    .describe('Required for kind="kpi". value is a pre-formatted string e.g. "12,431" or "₹4.2L".'),
  // table
  columns: z.array(z.string()).optional().describe('Required for kind="table".'),
  rows: z.array(z.array(z.string())).optional().describe('Required for kind="table".'),
  // funnel
  steps: z
    .array(z.object({ label: z.string(), count: z.number() }))
    .optional()
    .describe('Required for kind="funnel". 3-6 steps, broadest first, narrowest last.'),
});

export type Visualization = z.infer<typeof vizSchema>;

// Muted agent accents. Used ONLY on monogram borders and the 2px name rule.
// NEVER as backgrounds, never as decoration.
export const AGENT_HEX: Record<string, string> = {
  violet: "#a78bda",
  amber: "#d4a55c",
  emerald: "#7eaa8a",
  sky: "#7fa6bc",
  rose: "#cb7a82",
  ochre: "#a88b5e", // Vera — budget strategist
  default: "#ededed",
};

export const VISUALIZATION_GUIDANCE = `STRICT RENDERING RULES (these are not optional):
1. NEVER write a markdown table. The pipe-character syntax \`| col | col |\` is FORBIDDEN.
2. If your answer would reference 2+ comparable items (channels, pages, dates, segments, properties, devices, countries, etc.), you MUST call render_visualization BEFORE writing any prose about them.
3. If your answer's headline is a single number (with or without a delta), call render_visualization with kind="kpi" first.
4. Picking the right kind:
   - \`kpi\` for headline single numbers (include change_pct + change_direction when comparing to a prior period)
   - \`bar\` for ≤10 categorical comparisons (channels, sources, pages, devices, countries)
   - \`line\` for time series (sessions per day, week-over-week trends)
   - \`funnel\` for sequential drop-offs (3-6 steps, broadest first, narrowest last)
   - \`pie\` ONLY when slices clearly sum to 100% (share of total)
   - \`table\` ONLY for 4+ columns of comparison data
5. After the visualization tool returns, write 2-4 sentences of interpretation under it — the chart shows what, your prose tells why it matters. Do not restate the numbers in the chart.
6. You may chain multiple render_visualization calls in one turn (e.g. a kpi followed by a bar).`;
