import type { DataSource, SourceType } from "./types";
import { ga4Source } from "./ga4";
import { googleAdsSource } from "./google_ads";
import { metaAdsSource } from "./meta_ads";
import { moengageSource } from "./moengage";

export const SOURCES: Record<SourceType, DataSource> = {
  ga4: ga4Source,
  google_ads: googleAdsSource,
  meta_ads: metaAdsSource,
  moengage: moengageSource,
};

export const LIVE_SOURCES: DataSource[] = Object.values(SOURCES).filter(
  (s) => s.status !== "stub"
);

export * from "./types";
