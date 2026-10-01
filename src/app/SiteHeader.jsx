"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import { useRealtimeTable } from "@/lib/useRealtimeTable";

// Desktop: one slim ruled bar with every destination.
// Phone: a thin wordmark bar on top and a five-slot tab bar under the thumb;
// staff tools (Post Games, Display, Admin) live under "More".
const DESKTOP_LINKS = [
  { href: "/", label: "Home" },
  { href: "/standings", label: "Standings" },
  { href: "/leaders", label: "Leaders" },
  { href: "/past-games", label: "Past Games" },
  { href: "/highlights", label: "Highlights" },
  { href: "/awards", label: "Awards" },
  { href: "/post", label: "Post Games" },
  { href: "/display", label: "Display" },
  { href: "/admin", label: "Admin" },
];

const MORE_LINKS = [
  { href: "/post", label: "Post Games" },
  { href: "/highlights", label: "Highlights" },
  { href: "/awards", label: "Awards" },
  { href: "/display", label: "Wall Display" },
  { href: "/install", label: "Install the app" },
  { href: "/admin", label: "Admin" },
];

// One stroke weight, one size: 1.75 stroke, 24 box.
const ICONS = {
  scores: <path d="M4 5h16M4 12h16M4 19h16M8 5v14M16 5v14" />,
  standings: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  leaders: <path d="M12 3l2.6 5.6 6 .7-4.4 4.1 1.2 6L12 16.5 6.6 19.4l1.2-6L3.4 9.3l6-.7L12 3z" />,
  games: <path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
};

function TabIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

function isActive(pathname, href) {
  return href === "/" ? pathname === "/" : pathname?.startsWith(href);
}

export default function SiteHeader() {
  const pathname = usePathname();
  const { season, session } = useAppMode();
  const [liveCount, setLiveCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

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

  // The LIVE chip updates the moment a game starts or finalizes, on every
  // open page.
  useRealtimeTable("live_games", loadLiveCount);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const moreActive = MORE_LINKS.some((l) => isActive(pathname, l.href));

  const tabs = [
    { href: "/", label: "Scores", icon: "scores", active: pathname === "/" || pathname?.startsWith("/live") },
    { href: "/standings", label: "Standings", icon: "standings", active: isActive(pathname, "/standings") },
    { href: "/leaders", label: "Leaders", icon: "leaders", active: isActive(pathname, "/leaders") },
    { href: "/past-games", label: "Games", icon: "games", active: isActive(pathname, "/past-games") },
  ];

  return (
    <>
      <header className="cl-topbar">
        <div className="bc-container cl-topbar-inner">
          <Link href="/" className="cl-wordmark">
            <img className="cl-crest" src="/crest-logo.png" alt="" width="54" height="54" />
            <span className="cl-wordmark-text">Crest League <em>Live</em></span>
          </Link>

          {liveCount > 0 ? (
            <Link href="/" className="bc-live-badge">
              <span className="bc-live-dot" aria-hidden="true" />
              {liveCount} live
            </Link>
          ) : null}

          <nav className="cl-nav" aria-label="Main">
            {DESKTOP_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
                className="cl-nav-link"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {moreOpen ? (
        <div className="cl-more-sheet" id="cl-more-sheet">
          {MORE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="cl-more-link"
              aria-current={isActive(pathname, l.href) ? "page" : undefined}
            >
              {l.label}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          ))}
        </div>
      ) : null}

      <nav
        className="cl-tabbar"
        aria-label="Main"
        style={{
          "--tab-i": Math.max(0, tabs.findIndex((t) => t.active) === -1 ? (moreActive || moreOpen ? 4 : 0) : tabs.findIndex((t) => t.active)),
          "--tab-on": tabs.some((t) => t.active) || moreActive || moreOpen ? 1 : 0,
        }}
      >
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="cl-tab" aria-current={t.active ? "page" : undefined}>
            <TabIcon name={t.icon} />
            {t.label}
          </Link>
        ))}
        <button
          type="button"
          className="cl-tab"
          aria-expanded={moreOpen}
          aria-controls="cl-more-sheet"
          aria-current={moreActive && !moreOpen ? "page" : undefined}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <TabIcon name="more" />
          More
        </button>
      </nav>
    </>
  );
}
