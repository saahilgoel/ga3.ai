// Shopify catalog ingestion — public `/products.json` is open on most stores.
// We probe it, and if it looks like a Shopify catalog we paginate up to 20
// pages × 250 = 5000 products. Each product becomes a small RAG document tagged
// `catalog_shopify` so agents can answer "what does competitor X sell?" or
// "which of my products has 'serum' in the title?" with citations.

import {
  embedAndStoreDocument,
  insertContextDocument,
} from "./db-helpers";
import { getDb } from "@/lib/db";

const MAX_PAGES = 20;
const PER_PAGE = 250;
const PROBE_TIMEOUT_MS = 8_000;
const PAGE_TIMEOUT_MS = 12_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ga-chat";

type ShopifyVariant = {
  id?: number;
  title?: string;
  price?: string;
  compare_at_price?: string | null;
  sku?: string;
  inventory_quantity?: number;
  available?: boolean;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
};

type ShopifyImage = {
  src?: string;
  alt?: string | null;
};

type ShopifyProduct = {
  id?: number;
  title?: string;
  handle?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  body_html?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string;
  variants?: ShopifyVariant[];
  images?: ShopifyImage[];
};

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json,text/plain,*/*",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!/json/i.test(ct)) {
      // Some stores serve products.json with text/plain — try parsing anyway.
      const txt = await res.text();
      try {
        return JSON.parse(txt);
      } catch {
        return null;
      }
    }
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isShopifyJson(data: unknown): data is { products: ShopifyProduct[] } {
  return (
    !!data &&
    typeof data === "object" &&
    Array.isArray((data as { products?: unknown }).products)
  );
}

function priceRange(variants: ShopifyVariant[] | undefined): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (!variants || variants.length === 0) {
    return { min: null, max: null, currency: null };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of variants) {
    const n = Number(v.price ?? NaN);
    if (Number.isFinite(n)) {
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  if (!Number.isFinite(min)) return { min: null, max: null, currency: null };
  return { min, max, currency: null };
}

function productToContent(p: ShopifyProduct, productUrl: string): string {
  const variants = p.variants ?? [];
  const { min, max } = priceRange(variants);
  const priceLine =
    min == null
      ? null
      : min === max
      ? `Price: ${min}`
      : `Price: ${min}–${max}`;
  const tagsArr = Array.isArray(p.tags)
    ? p.tags
    : typeof p.tags === "string"
    ? p.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const variantsInStock = variants.filter(
    (v) => v.available !== false && (v.inventory_quantity ?? 1) > 0
  ).length;
  const image = p.images?.[0]?.src;
  const lines = [
    `Product: ${p.title ?? "(untitled)"}`,
    p.vendor && `Brand: ${p.vendor}`,
    p.product_type && `Category: ${p.product_type}`,
    priceLine,
    `Variants: ${variants.length} total, ${variantsInStock} in stock`,
    tagsArr.length > 0 && `Tags: ${tagsArr.slice(0, 16).join(", ")}`,
    p.published_at && `Published: ${p.published_at.slice(0, 10)}`,
    `URL: ${productUrl}`,
    image && `Image: ${image}`,
    "",
    stripHtml(p.body_html).slice(0, 1500),
  ]
    .filter((l) => l !== null && l !== false && l !== undefined && l !== "")
    .map(String);
  return lines.join("\n");
}

export type ShopifyCatalogResult = {
  is_shopify: boolean;
  products_count: number;
  pages_fetched: number;
  docs_inserted: number;
  chunks_inserted: number;
  aborted_reason: string | null;
};

export async function ingestShopifyCatalog(args: {
  workspace_id: number;
  website_url: string;
  competitor_id?: number | null;
  onProgress?: (page: number, products_so_far: number) => void;
}): Promise<ShopifyCatalogResult> {
  const origin = originOf(args.website_url);
  if (!origin) {
    return {
      is_shopify: false,
      products_count: 0,
      pages_fetched: 0,
      docs_inserted: 0,
      chunks_inserted: 0,
      aborted_reason: "bad_url",
    };
  }

  // Probe page 1 with a small limit first
  const probe = await fetchJson(`${origin}/products.json?limit=1`, PROBE_TIMEOUT_MS);
  if (!isShopifyJson(probe)) {
    return {
      is_shopify: false,
      products_count: 0,
      pages_fetched: 0,
      docs_inserted: 0,
      chunks_inserted: 0,
      aborted_reason: "not_shopify",
    };
  }

  // Skip if we already have a recent catalog ingest for this scope
  const scopeRow = getDb()
    .prepare(
      `SELECT MAX(fetched_at) AS last, COUNT(*) AS n FROM context_documents
       WHERE workspace_id = ?
         AND source_type = 'catalog_shopify'
         AND ${args.competitor_id ? "competitor_id = ?" : "competitor_id IS NULL"}`
    )
    .get(
      ...(args.competitor_id
        ? [args.workspace_id, args.competitor_id]
        : [args.workspace_id])
    ) as { last: number | null; n: number } | undefined;
  const lastAt = scopeRow?.last;
  if (lastAt && Date.now() - lastAt * 1000 < 7 * 24 * 60 * 60_000 && (scopeRow?.n ?? 0) > 0) {
    // Already ingested in the last 7 days; skip.
    return {
      is_shopify: true,
      products_count: scopeRow?.n ?? 0,
      pages_fetched: 0,
      docs_inserted: 0,
      chunks_inserted: 0,
      aborted_reason: "fresh_within_7d",
    };
  }

  const seenIds = new Set<number>();
  let docs = 0;
  let chunks = 0;
  let pages = 0;
  let aborted_reason: string | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${origin}/products.json?limit=${PER_PAGE}&page=${page}`;
    const data = await fetchJson(url, PAGE_TIMEOUT_MS);
    if (!isShopifyJson(data)) {
      aborted_reason = page === 1 ? "first_page_not_json" : "later_page_not_json";
      break;
    }
    const products = data.products;
    pages = page;
    if (products.length === 0) {
      aborted_reason = "no_more_products";
      break;
    }
    let newOnPage = 0;
    for (const p of products) {
      if (p.id && seenIds.has(p.id)) continue;
      if (p.id) seenIds.add(p.id);
      newOnPage += 1;
      const productUrl = p.handle ? `${origin}/products/${p.handle}` : origin;
      const content = productToContent(p, productUrl);
      const { min, max } = priceRange(p.variants);
      const title = p.title || p.handle || `Product ${p.id ?? "?"}`;
      try {
        const docId = insertContextDocument({
          workspace_id: args.workspace_id,
          source_type: "catalog_shopify",
          source_url: productUrl,
          title,
          content,
          metadata: {
            shopify_id: p.id ?? null,
            vendor: p.vendor ?? null,
            product_type: p.product_type ?? null,
            tags: Array.isArray(p.tags)
              ? p.tags
              : typeof p.tags === "string"
              ? p.tags.split(",").map((t) => t.trim())
              : [],
            price_min: min,
            price_max: max,
            variant_count: p.variants?.length ?? 0,
            image: p.images?.[0]?.src ?? null,
            published_at: p.published_at ?? null,
          },
          competitor_id: args.competitor_id ?? null,
        });
        const inserted = await embedAndStoreDocument({
          document_id: docId,
          workspace_id: args.workspace_id,
          content,
          atomic: true,
        });
        docs += 1;
        chunks += inserted;
      } catch (err) {
        console.warn(
          `[shopify] insert failed for product "${title}":`,
          (err as Error).message
        );
      }
    }
    try {
      args.onProgress?.(page, seenIds.size);
    } catch {
      /* ignore */
    }
    // If a full page returned 0 new (all duplicates), the store is paginating
    // the same window — bail rather than burning loops.
    if (newOnPage === 0) {
      aborted_reason = "all_duplicates_on_page";
      break;
    }
    // If the page returned fewer than per_page items, there are no more.
    if (products.length < PER_PAGE) {
      aborted_reason = "last_page";
      break;
    }
  }

  console.log(
    `[shopify] ${origin} ws=${args.workspace_id}${args.competitor_id ? ` competitor=${args.competitor_id}` : ""} → ${seenIds.size} products / ${pages} pages / ${docs} docs / ${chunks} chunks (${aborted_reason ?? "max_pages"})`
  );

  return {
    is_shopify: true,
    products_count: seenIds.size,
    pages_fetched: pages,
    docs_inserted: docs,
    chunks_inserted: chunks,
    aborted_reason,
  };
}
