import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import { deleteAppSetting, getAppSetting, setAppSetting } from "@/lib/db";
import {
  DATA_CENTERS,
  MOENGAGE_SETTING_KEYS,
  isMoEngageConfigured,
} from "@/lib/sources/moengage/api";

function mask(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 6) return "•".repeat(value.length);
  return value.slice(0, 3) + "•".repeat(value.length - 6) + value.slice(-3);
}

export async function GET() {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const appId = getAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.appId });
  const apiId = getAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.apiId });
  const apiKey = getAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.apiKey });
  const dc =
    getAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.dataCenter }) ||
    null;
  return NextResponse.json({
    configured: isMoEngageConfigured(userId),
    app_id: appId,
    masked_api_id: mask(apiId),
    masked_api_key: mask(apiKey),
    data_center: dc,
    data_centers: Object.entries(DATA_CENTERS).map(([id, v]) => ({
      id,
      label: v.label,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    app_id?: string;
    data_api_id?: string;
    data_api_key?: string;
    data_center?: string;
  };
  const appId = (body.app_id || "").trim();
  const apiId = (body.data_api_id || "").trim();
  const apiKey = (body.data_api_key || "").trim();
  const dc = (body.data_center || "dc-01").trim();
  if (!appId || !apiId || !apiKey) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!DATA_CENTERS[dc]) {
    return NextResponse.json({ error: "invalid_data_center" }, { status: 400 });
  }
  setAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.appId, value: appId });
  setAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.apiId, value: apiId });
  setAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.apiKey, value: apiKey });
  setAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.dataCenter, value: dc });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  for (const k of Object.values(MOENGAGE_SETTING_KEYS)) {
    deleteAppSetting({ user_id: userId, key: k });
  }
  return NextResponse.json({ ok: true });
}
