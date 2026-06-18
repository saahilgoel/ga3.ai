import { redirect } from "next/navigation";

// The old "workspaces" grouping/merge screen is gone. ga-chat now works one
// GA4 property at a time, so this route just points at the property picker.
export default function WorkspacesPage() {
  redirect("/properties");
}
