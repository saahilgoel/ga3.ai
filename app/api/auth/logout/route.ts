import { getSession } from "@/lib/session";
import { relativeRedirect } from "@/lib/redirect";

export async function GET() {
  const session = await getSession();
  session.destroy();
  return relativeRedirect("/");
}
