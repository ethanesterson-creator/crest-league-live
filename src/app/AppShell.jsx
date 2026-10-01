"use client";

import { usePathname } from "next/navigation";
import SiteHeader from "./SiteHeader";

// The wall board (/display) is projected, not navigated: it gets the whole
// screen and none of the site chrome. Every other page shares one header,
// one content column, and one footer.
export default function AppShell({ children }) {
  const pathname = usePathname();
  if (pathname === "/display") {
    return <main data-theme="night" style={{ minHeight: "100vh" }}>{children}</main>;
  }
  // /awards is the banquet page: Night palette, gold allowed.
  const night = pathname === "/awards";
  return (
    <div data-theme={night ? "night" : undefined} style={{ minHeight: "100vh" }}>
      <SiteHeader />
      <main className="bc-container">{children}</main>
      <footer className="bc-container bc-faint cl-footer">
        <span>Built for Camp Bauercrest — Crest League Live</span>
        <span>Created by Ethan Esterson</span>
      </footer>
    </div>
  );
}
