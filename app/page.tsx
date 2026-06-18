import { redirect } from "next/navigation";
import { getSession, readUserIds, readActivePropertyIds } from "@/lib/session";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home() {
  const session = await getSession();
  if (readUserIds(session).length > 0) {
    if (readActivePropertyIds(session).length > 0) redirect("/dashboard");
    redirect("/properties");
  }

  return <LandingPage />;
}
