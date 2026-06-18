"use client";

import { useState } from "react";
import { TopBar } from "@/components/top-bar";
import { MobileNavSheet } from "@/components/mobile-nav-sheet";

// Client chrome wrapper so the mobile-nav drawer state lives at the layout
// level (the layout itself is a server component for auth). The top bar's
// hamburger opens the drawer on every authenticated page — previously it was
// a dead <Link> and only chat/feed had (unwired) drawers.
export function AppChrome() {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <>
      <TopBar onMenu={() => setNavOpen(true)} />
      <MobileNavSheet open={navOpen} onClose={() => setNavOpen(false)} />
    </>
  );
}
