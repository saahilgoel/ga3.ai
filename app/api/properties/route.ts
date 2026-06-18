import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { getFreshAccessToken, listGa4Properties } from "@/lib/google";
import { getUsersByIds, upsertProperty, getPropertiesForUsers } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const users = getUsersByIds(userIds);
    const grouped: Array<{
      account_email: string;
      user_id: number;
      properties: Array<{
        ga4_property_id: string;
        display_name: string;
        account_name: string;
        user_id: number;
        db_id?: number;
      }>;
    }> = [];

    await Promise.all(
      users.map(async (u) => {
        const token = await getFreshAccessToken(u.id);
        const props = await listGa4Properties(token);
        // Persist so DB IDs are stable when the user picks.
        const persisted = props.map((p) => {
          const row = upsertProperty({
            user_id: u.id,
            ga4_property_id: p.ga4_property_id,
            display_name: p.display_name,
            website_url: null,
          });
          return { ...p, user_id: u.id, db_id: row.id };
        });
        grouped.push({ account_email: u.email, user_id: u.id, properties: persisted });
      })
    );

    grouped.sort((a, b) => a.account_email.localeCompare(b.account_email));

    // Flat list for backward compat with v1 UI:
    const flat = grouped.flatMap((g) => g.properties);

    // Also surface which DB property ids are currently active.
    const allRows = getPropertiesForUsers(userIds);
    const activeDbIds = allRows.filter((r) => r.is_active).map((r) => r.id);
    // Single active property (Google-style: one property at a time).
    const activeSingle = (session.active_property_ids ?? activeDbIds)[0] ?? null;

    return NextResponse.json({
      properties: flat,
      grouped,
      active_property_ids: session.active_property_ids ?? activeDbIds,
      active_property_id: activeSingle,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
