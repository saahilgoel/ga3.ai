import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native-binary packages must be excluded from Turbopack bundling. sqlite-vec
  // uses import.meta.url internally to find its .dylib — Turbopack rewrites
  // that and breaks the extension loader.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "pdf-parse"],
};

export default nextConfig;
