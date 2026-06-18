import { NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import {
  isGoogleAdsConfigured,
  listAccessibleAdsCustomers,
  userHasAdsScope,
} from "@/lib/sources/google_ads/api";

export async function GET() {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isGoogleAdsConfigured(userId)) {
    return NextResponse.json({
      configured: false,
      scope_granted: false,
      customers: [],
      hint:
        "Paste your Google Ads developer token below to get started. Get one from a Google Ads Manager (MCC) account → Tools → API Center.",
    });
  }
  const scope = userHasAdsScope(userId);
  if (!scope) {
    return NextResponse.json({
      configured: true,
      scope_granted: false,
      customers: [],
      grant_url: "/api/auth/connect-ads",
    });
  }
  try {
    const customers = await listAccessibleAdsCustomers({ userId });
    return NextResponse.json({
      configured: true,
      scope_granted: true,
      customers,
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        scope_granted: true,
        customers: [],
        error: (err as Error).message,
      },
      { status: 500 }
    );
  }
}
