// Legacy endpoint kept for older v3 clients — routes through the new activate flow.
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    ga4_property_id?: string;
    display_name?: string;
  };
  if (!body.ga4_property_id || !body.display_name) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  // Forward to /api/properties to resolve, then activate. The new path is
  // the v3 multi-select + workspace flow — clients should call /api/properties/activate.
  return NextResponse.json(
    { error: "use /api/properties/activate with property_ids" },
    { status: 410 }
  );
}
