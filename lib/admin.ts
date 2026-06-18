import { readUserIds, type SessionData } from "@/lib/session";
import { getUsersByIds } from "@/lib/db";

// Admin access = OWNER_EMAIL + anyone in ADMIN_EMAILS, both from the environment
// (comma-separated). Set these on your host — no code change needed to add or
// remove admins. With neither set, there are no admins (safe default for forks).
const ADMIN_EMAILS = new Set(
  [
    process.env.OWNER_EMAIL || "",
    ...(process.env.ADMIN_EMAILS || "").split(","),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function isAdmin(session: SessionData): boolean {
  try {
    const ids = readUserIds(session);
    if (ids.length === 0) return false;
    const users = getUsersByIds(ids);
    return users.some((u) => ADMIN_EMAILS.has((u.email || "").toLowerCase()));
  } catch {
    return false;
  }
}
