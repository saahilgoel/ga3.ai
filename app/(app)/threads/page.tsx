import { redirect } from "next/navigation";

export default function LegacyThreadsRedirect() {
  redirect("/chats");
}
