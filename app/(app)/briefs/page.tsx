import { redirect } from "next/navigation";

// Briefs is now folded into Library. Keep the route for back-compat (old links
// from chats etc.) but bounce visitors to the unified Library entry point.
export default function BriefsIndexRedirect() {
  redirect("/library");
}
