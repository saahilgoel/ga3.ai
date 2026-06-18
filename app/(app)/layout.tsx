import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { AppChrome } from "@/components/app-chrome";
import { ProgressStrip } from "@/components/progress-strip";
import { SwitchToast } from "@/components/switch-toast";

// Shared shell for every authenticated page. Sidebar + TopBar live here so
// they never re-mount on navigation — a click registers in <50ms because
// only the children slot has to re-render. Pages render their own content
// area (scroll container, max-width, etc) so they keep layout flexibility
// (e.g. /reports has a split rail).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (readUserIds(session).length === 0) redirect("/");
  return (
    <main className="h-screen flex bg-[color:var(--bg)] text-[color:var(--text-primary)] overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <AppChrome />
        <ProgressStrip />
        {children}
      </div>
      <SwitchToast />
    </main>
  );
}
