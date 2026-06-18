import { z } from "zod";
import { vizSchema } from "@/lib/viz";

export const briefSectionSchema = z.object({
  heading: z.string(),
  body: z.string().optional(),
  bullets: z
    .array(
      z.object({
        text: z.string(),
        agent: z.string().optional(),
      })
    )
    .optional(),
  visualization: vizSchema.optional().nullable(),
  table: z
    .object({
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      highlight_rows: z.array(z.number()).optional(),
    })
    .optional()
    .nullable(),
  funnel: z
    .object({
      steps: z.array(z.object({ label: z.string(), count: z.number() })),
    })
    .optional()
    .nullable(),
  kpis: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        change_pct: z.number().optional(),
        change_direction: z.enum(["up", "down", "flat"]).optional(),
      })
    )
    .optional()
    .nullable(),
});

export const briefOutputSchema = z.object({
  template_id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  range_label: z.string().optional(),
  sections: z.array(briefSectionSchema),
  footer: z
    .object({
      duration_s: z.number().optional(),
      agent_calls: z.number().optional(),
      ga4_calls: z.number().optional(),
    })
    .optional(),
});

export type BriefSection = z.infer<typeof briefSectionSchema>;
export type BriefOutput = z.infer<typeof briefOutputSchema>;

export type BriefTemplate = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  needsInput?: boolean;
  estimatedSeconds: number;
  agents: string[];
};
