// AI Brief — ask Google AI Mode + ChatGPT a curated set of "brand intelligence"
// questions and store the synthesised answers as embedded RAG documents.
//
// This replaces a lot of brittle HTML scraping (Trustpilot/Indeed/etc) with
// pre-digested answers grounded in fresh search data. Two upstreams:
//   - /google/ai_mode  (10 credits each, returns text + references)
//   - /chatgpt         (free-form prompt → synthesised text)
//
// Total cost: ~10 questions × 10 credits + 5 prompts × ~5 credits = ~125 credits
// for a workspace's primary brand brief. We run them in parallel via a small
// concurrency pool (ScrapingDog already has its own semaphore inside).

import * as sd from "./scrapingdog";

export type BriefQA = {
  question: string;
  answer: string;
  references: Array<{ title: string; url: string; source: string }>;
  source: "ai_mode" | "chatgpt";
  credits: number;
};

const AI_MODE_QUESTIONS = (brand: string, websiteUrl: string): string[] => [
  `What does ${brand} (${websiteUrl}) sell, and who are their target customers?`,
  `What is ${brand}'s pricing model? Is it premium, mid-market, or budget?`,
  `What are the most common customer complaints about ${brand}? Cite specific issues.`,
  `What do customers love most about ${brand}? Cite specific praise.`,
  `Who are the top 5 direct competitors of ${brand}, and how do they differ?`,
  `How is ${brand} positioned compared to its competitors? What's its unique angle?`,
  `What are ${brand}'s most recent launches, news, or announcements in the last 90 days?`,
  `What is ${brand}'s estimated revenue, funding, employee count, or company size?`,
  `What marketing channels does ${brand} use? Are they strong on SEO, paid ads, social, or referrals?`,
  `What controversies, PR issues, or negative press has ${brand} faced?`,
];

const CHATGPT_PROMPTS = (brand: string, websiteUrl: string): string[] => [
  `Write a thorough analyst-style profile of the company "${brand}" (${websiteUrl}). Cover: what they sell, their go-to-market motion, who their ideal customer is, what differentiates them, and the 3 biggest risks to their business. Be concrete and avoid generic platitudes.`,
  `What are the top 5 strategic moves "${brand}" (${websiteUrl}) could make in the next 12 months to grow faster? For each, briefly explain why.`,
  `Imagine you are advising "${brand}" (${websiteUrl}) on their conversion funnel. Based on common patterns for businesses in their category, what are the most likely drop-off points and remedies?`,
  `Who would describe themselves as a power user of "${brand}" (${websiteUrl})? Sketch 3 distinct user personas with their motivations, pain points, and the trigger that brought them to the brand.`,
  `If you were briefing a paid-ads strategist on "${brand}" (${websiteUrl}), what should they know about the brand's positioning, audience, and competitive landscape before they touch a campaign?`,
];

const TIMEOUT_MS = 45_000; // per-question hard cap

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(fallback);
    });
  });
}

export async function runAiBrief(args: {
  brand_name: string;
  website_url: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{
  results: BriefQA[];
  credits: number;
  succeeded: number;
  failed: number;
}> {
  const aiModeQs = AI_MODE_QUESTIONS(args.brand_name, args.website_url);
  const gptPrompts = CHATGPT_PROMPTS(args.brand_name, args.website_url);
  const total = aiModeQs.length + gptPrompts.length;
  let done = 0;
  const tick = () => {
    done += 1;
    try {
      args.onProgress?.(done, total);
    } catch {
      // best-effort
    }
  };

  const aiModeJobs = aiModeQs.map((q) =>
    withTimeout(
      sd.googleAIOverview(q, { country: "in" }),
      TIMEOUT_MS,
      { text: null, references: [], credits: 0 }
    ).then((r) => {
      tick();
      const qa: BriefQA = {
        question: q,
        answer: r.text ?? "",
        references: r.references.map((ref) => ({
          title: ref.title,
          url: ref.url,
          source: ref.source,
        })),
        source: "ai_mode",
        credits: r.credits,
      };
      return qa;
    })
  );

  const gptJobs = gptPrompts.map((p) =>
    withTimeout(sd.chatgptAsk(p), TIMEOUT_MS, {
      text: null,
      credits: 0,
    }).then((r) => {
      tick();
      const qa: BriefQA = {
        question: p,
        answer: r.text ?? "",
        references: [],
        source: "chatgpt",
        credits: r.credits,
      };
      return qa;
    })
  );

  const all = await Promise.all([...aiModeJobs, ...gptJobs]);
  const credits = all.reduce((s, r) => s + r.credits, 0);
  const succeeded = all.filter((r) => r.answer && r.answer.length > 60).length;
  return {
    results: all,
    credits,
    succeeded,
    failed: all.length - succeeded,
  };
}
