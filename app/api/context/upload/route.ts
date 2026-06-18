import { NextRequest, NextResponse } from "next/server";
import matter from "gray-matter";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import {
  embedAndStoreDocument,
  insertContextDocument,
  upsertContextStatus,
} from "@/lib/context/db-helpers";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  const filename = file.name || "uploaded.txt";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!["md", "txt", "pdf"].includes(ext)) {
    return NextResponse.json(
      { error: "Only .md, .txt, .pdf supported." },
      { status: 400 }
    );
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let content = "";
  let title: string | null = null;

  try {
    if (ext === "pdf") {
      // pdf-parse exports a function as the module default in CJS land. The
      // TypeScript types are flaky, so we coerce.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import("pdf-parse")) as any;
      const pdfParse: (b: Buffer) => Promise<{ text: string; info?: { Title?: string } }> =
        mod.default ?? mod;
      const data = await pdfParse(buf);
      content = data.text;
      title = data.info?.Title ?? filename;
    } else if (ext === "md") {
      const parsed = matter(buf.toString("utf-8"));
      title = (parsed.data?.title as string | undefined) ?? filename;
      content = parsed.content;
    } else {
      content = buf.toString("utf-8");
      title = filename;
    }
  } catch (err) {
    return NextResponse.json(
      { error: `parse_failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  const cleaned = content.replace(/\s+/g, " ").trim();
  if (cleaned.length < 50) {
    return NextResponse.json({ error: "File has no extractable text." }, { status: 400 });
  }

  const doc_id = insertContextDocument({
    workspace_id: ws.id,
    source_type: "user_upload",
    title,
    content: cleaned,
    user_uploaded: true,
    filename,
  });
  const chunkCount = await embedAndStoreDocument({
    document_id: doc_id,
    workspace_id: ws.id,
    content: cleaned,
  });
  upsertContextStatus({
    workspace_id: ws.id,
    add_documents: 1,
    add_chunks: chunkCount,
  });

  return NextResponse.json({
    ok: true,
    document_id: doc_id,
    filename,
    chunks: chunkCount,
  });
}
