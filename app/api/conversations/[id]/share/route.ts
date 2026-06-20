import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession, readUserIds } from "@/lib/session";
import {
  getConversationById,
  setConversationShareToken,
} from "@/lib/db";

function newToken(): string {
  // URL-safe, unguessable. 18 bytes -> 24 base64url chars.
  return randomBytes(18).toString("base64url");
}

async function authorize(
  context: { params: Promise<{ id: string }> }
): Promise<
  | { ok: true; id: number; conv: NonNullable<ReturnType<typeof getConversationById>> }
  | { ok: false; res: NextResponse }
> {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0)
    return { ok: false, res: NextResponse.json({ error: "not_authenticated" }, { status: 401 }) };
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  const conv = getConversationById(id);
  if (!conv)
    return { ok: false, res: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  if (!userIds.includes(conv.user_id))
    return { ok: false, res: NextResponse.json({ error: "not_authorized" }, { status: 403 }) };
  return { ok: true, id, conv };
}

// Create (or return the existing) public share link for a conversation.
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.res;
  let token = auth.conv.share_token;
  if (!token) {
    token = newToken();
    setConversationShareToken(auth.id, token);
  }
  return NextResponse.json({ token, path: `/share/${token}` });
}

// Revoke the share link.
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.res;
  setConversationShareToken(auth.id, null);
  return NextResponse.json({ ok: true });
}

// Report current share state (so the dialog can show the existing link).
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.res;
  const token = auth.conv.share_token;
  return NextResponse.json(
    token ? { token, path: `/share/${token}` } : { token: null }
  );
}
