"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import { useRealtimeTable } from "@/lib/useRealtimeTable";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/standings", label: "Standings" },
  { href: "/leaders", label: "Leaders" },
  { href: "/past-games", label: "Past Games" },
  { href: "/display", label: "Display" },
  { href: "/highlights", label: "Highlights" },
  { href: "/admin", label: "Admin" },
  { href: "/awards", label: "Awards" },
  { href: "/post", label: "Post Games" },
];

// The app's one shared piece of chrome -- present on literally every page,
// so it's the highest-leverage place to actually feel like one network
// instead of a dozen separately-styled tools. Replaces a plain text-link
// bar that had no active-page state and no sense that anything was ever
// "live" unless you happened to already be on /display.
export default function SiteHeader() {
  const pathname = usePathname();
  const { season, session } = useAppMode();
  const [liveCount, setLiveCount] = useState(0);

  async function loadLiveCount() {
    const { count, error } = await supabase
      .from("live_games")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("season", season)
      .eq("session", session)
      .is("played_on", null);
    if (!error) setLiveCount(count || 0);
  }

  useEffect(() => {
    loadLiveCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, session]);

  // Same instant-propagation Realtime pattern used everywhere else in the
  // app -- the header's LIVE badge updates the moment a game starts or
  // finalizes, on every open page, not just /display.
  useRealtimeTable("live_games", loadLiveCount);

  return (
    <header className="bc-site-header">
      <div className="bc-site-header-bar" />
      <div className="bc-container bc-site-header-inner">
        <Link href="/" className="bc-wordmark">
          <span className="bc-wordmark-badge">CLL</span>
          <span className="bc-wordmark-text">
            Crest League <em>Live</em>
          </span>
        </Link>

        {liveCount > 0 ? (
          <Link href="/display" className="bc-live-badge">
            <span className="bc-live-dot" aria-hidden="true" />
            {liveCount} LIVE NOW
          </Link>
        ) : null}

        <nav className="bc-nav" aria-label="Main">
          {NAV_LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`bc-nav-link ${active ? "bc-nav-link-active" : ""}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
