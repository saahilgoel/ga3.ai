import { ensureLibrarySeeded } from "@/lib/library/loader";
import { LibraryClient } from "./library-client";

export default async function LibraryPage() {
  // Auth gate is handled by app/(app)/layout.tsx. Idempotent seed costs ~30ms.
  try {
    ensureLibrarySeeded(false);
  } catch (err) {
    console.warn("[library page] seed failed:", (err as Error).message);
  }
  return (
    <div className="flex-1 overflow-hidden">
      <LibraryClient />
    </div>
  );
}
