import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/");
  return <AdminClient />;
}
