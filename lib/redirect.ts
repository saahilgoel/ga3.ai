import { NextResponse } from "next/server";

/**
 * Redirect using a RELATIVE `Location` header.
 *
 * The browser resolves a relative Location against the URL it actually
 * requested — i.e. the public origin in the address bar — instead of the
 * server's internal host. This is essential behind a reverse proxy such as
 * Railway, where `req.url` resolves to `http://localhost:8080` and an absolute
 * redirect (`new URL(path, req.url)`) would bounce users to a dead localhost
 * address after OAuth.
 */
export function relativeRedirect(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}
