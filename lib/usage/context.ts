import { AsyncLocalStorage } from "node:async_hooks";

// Cross-cutting attribution for usage events. Entry points (API routes,
// scheduler jobs) set {account, workspace, section}; deep chokepoints
// (ScrapingDog, Voyage, the wrapped Anthropic model) read it to attribute
// usage without threading args through every call.
export type UsageCtx = {
  userId: number | null;
  workspaceId: number | null;
  section: string;
};

const als = new AsyncLocalStorage<UsageCtx>();

export function runWithUsage<T>(ctx: UsageCtx, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getUsageContext(): UsageCtx | undefined {
  return als.getStore();
}
