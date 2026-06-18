"use client";

import { useState } from "react";

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The site's favicon (brand mark) for a property's website. Pulled from
 * Google's favicon service — zero backend, works for any public domain.
 * Renders nothing if there's no resolvable host or the icon fails to load.
 */
export function SiteFavicon({
  url,
  size = 28,
  className = "",
}: {
  url: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);
  if (!host || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=128`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`rounded-md shrink-0 bg-white/5 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
