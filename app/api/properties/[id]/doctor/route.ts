import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { getPropertyById, setPropertyDoctor } from "@/lib/db";
import { getFreshAccessToken } from "@/lib/google";
import { runPropertyDoctor } from "@/lib/doctor";

const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6h

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const property = getPropertyById(id);
  if (!property || !userIds.includes(property.user_id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const now = Math.floor(Date.now() / 1000);

  if (
    !refresh &&
    property.doctor_json &&
    property.doctor_checked_at &&
    now - property.doctor_checked_at < CACHE_TTL_SECONDS
  ) {
    return NextResponse.json({
      report: JSON.parse(property.doctor_json),
      cached: true,
    });
  }

  const token = await getFreshAccessToken(property.user_id);
  const report = await runPropertyDoctor({
    ga4_property_id: property.ga4_property_id,
    access_token: token,
    declared_website_url: property.website_url,
  });
  setPropertyDoctor({
    property_id: property.id,
    doctor_json: JSON.stringify(report),
  });

  return NextResponse.json({ report, cached: false });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const property = getPropertyById(id);
  if (!property || !userIds.includes(property.user_id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const token = await getFreshAccessToken(property.user_id);
  const report = await runPropertyDoctor({
    ga4_property_id: property.ga4_property_id,
    access_token: token,
    declared_website_url: property.website_url,
  });
  setPropertyDoctor({
    property_id: property.id,
    doctor_json: JSON.stringify(report),
  });

  return NextResponse.json({ report, cached: false });
}
