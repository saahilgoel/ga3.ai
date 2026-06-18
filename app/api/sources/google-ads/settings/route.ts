import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import {
  deleteAppSetting,
  getAppSetting,
  setAppSetting,
} from "@/lib/db";
import { ADS_SETTING_KEYS } from "@/lib/sources/google_ads/api";

function mask(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 6) return "•".repeat(value.length);
  return value.slice(0, 3) + "•".repeat(value.length - 6) + value.slice(-3);
}

// Returns: source ('env' | 'db' | null), masked preview, login_customer_id
export async function GET() {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const envToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
  const dbToken = getAppSetting({ user_id: userId, key: ADS_SETTING_KEYS.token });
  const envLoginCid = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "";
  const dbLoginCid = getAppSetting({
    user_id: userId,
    key: ADS_SETTING_KEYS.loginCustomerId,
  });
  if (envToken) {
    return NextResponse.json({
      source: "env",
      configured: true,
      masked_token: mask(envToken),
      login_customer_id: envLoginCid || null,
      writable: false,
    });
  }
  return NextResponse.json({
    source: dbToken ? "db" : null,
    configured: !!dbToken,
    masked_token: mask(dbToken),
    login_customer_id: dbLoginCid,
    writable: true,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  // Refuse to overwrite env-provided token via the API (env always wins).
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Token is set via GOOGLE_ADS_DEVELOPER_TOKEN env var. Unset that to manage via UI.",
      },
      { status: 409 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    login_customer_id?: string;
  };
  const token = (body.token || "").trim();
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  setAppSetting({
    user_id: userId,
    key: ADS_SETTING_KEYS.token,
    value: token,
  });
  const loginCid = (body.login_customer_id || "").replace(/[\s-]/g, "").trim();
  if (loginCid) {
    setAppSetting({
      user_id: userId,
      key: ADS_SETTING_KEYS.loginCustomerId,
      value: loginCid,
    });
  } else {
    deleteAppSetting({
      user_id: userId,
      key: ADS_SETTING_KEYS.loginCustomerId,
    });
  }
  return NextResponse.json({ ok: true, masked_token: mask(token) });
}

export async function DELETE() {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return NextResponse.json(
      { error: "Token is set via env var; remove it from .env.local." },
      { status: 409 }
    );
  }
  deleteAppSetting({ user_id: userId, key: ADS_SETTING_KEYS.token });
  deleteAppSetting({
    user_id: userId,
    key: ADS_SETTING_KEYS.loginCustomerId,
  });
  return NextResponse.json({ ok: true });
}
