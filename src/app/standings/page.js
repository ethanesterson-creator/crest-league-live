"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { PageHeader, Sheet, EmptyState, ErrorNote, SkeletonRows, Meter } from "@/components/ui";
import FlashNumber from "@/components/FlashNumber";
const STAFF_SPORT_KEY = "staff";    // staff standings should live under standings.sport='staff'

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function sortStandings(arr) {
  const rows = [...(arr || [])];
  rows.sort((a, b) => {
    const ap = Number(a.league_points || a.points || 0);
    const bp = Number(b.league_points || b.points || 0);
    if (bp !== ap) return bp - ap;

    const aw = Number(a.wins || 0);
    const bw = Number(b.wins || 0);
    if (bw !== aw) return bw - aw;

    return String(a.team_name || "").localeCompare(String(b.team_name || ""));
  });
  return rows;
}

export default function StandingsPage() {
  const { season, session } = useAppMode();
  const [err, setErr] = useNotifyingErr();  const [loading, setLoading] = useState(true);

  // Tabs: overall | staff | non_game
  const [tab, setTab] = useState("overall");

  // Overall points rows from SQL function get_overall_points(include_staff, include_non_game)
  const [overallRows, setOverallRows] = useState([]);
  const includeStaff = false; // staff games removed
  const [includeNonGame, setIncludeNonGame] = useState(true);

  // Staff standings rows

  // Non-game points totals by team
  const [nonGameRows, setNonGameRows] = useState([]);

  async function loadOverallCamp() {
    // Uses the SQL function we added earlier
    const { data, error } = await supabase.rpc("get_overall_points", {
      include_staff: includeStaff,
      include_non_game: includeNonGame,
      p_season: season,
      p_session: session,
    });

    if (error) throw error;

    // data: [{team_name, points}]
    const cleaned = (data || []).map((r) => ({
      team_name: r.team_name,
      points: Number(r.points || 0),
    }));

    cleaned.sort((a, b) => Number(b.points) - Number(a.points) || String(a.team_name).localeCompare(String(b.team_name)));
    setOverallRows(cleaned);
  }


  async function loadNonGamePoints() {
    const { data, error } = await supabase
      .from("non_game_points")
      .select("team_name, points, status, deleted")
      .eq("season", season)
      .eq("session", session)
      .eq("deleted", false)
      .eq("status", "final")
      .limit(5000);

    if (error) throw error;

    const map = new Map();
    for (const r of data || []) {
      const key = String(r.team_name || "").toLowerCase();
      const cur = map.get(key) || { team_name: r.team_name, points: 0 };
      cur.points += Number(r.points || 0);
      map.set(key, cur);
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => Number(b.points) - Number(a.points) || String(a.team_name).localeCompare(String(b.team_name)));
    setNonGameRows(arr);
  }

  // Takes the target tab explicitly rather than reading `tab` state, because
  // the tab-switch buttons below call this in the same click that changes
  // `tab` — a stale closure captured before that state update used to reload
  // the OLD tab's data on the first click after a switch.
  async function refreshTab(activeTab) {
    setErr("");
    setLoading(true);
    try {
      if (activeTab === "overall") {
        await loadOverallCamp();
      } else if (activeTab === "non_game") {
        await loadNonGamePoints();
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Reload whichever tab is actually active — this used to always reload
    // "overall" regardless of tab, so flipping session/mode while on the
    // Non-Game tab left it showing the previous session's totals with no
    // indication they were stale.
    refreshTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, session]);

  // Refresh when the Non-Game toggle changes. The checkbox only renders
  // inside the Overall tab, so this can't fire from another tab. `tab`
  // itself is deliberately NOT a dep -- the tab buttons already call
  // refreshTab explicitly, and including it here made switching to Overall
  // fire loadOverallCamp twice on every click.
  const skipFirstToggleLoad = useRef(true);
  useEffect(() => {
    if (skipFirstToggleLoad.current) { skipFirstToggleLoad.current = false; return; }
    (async () => {
      setErr("");
      try {
        await loadOverallCamp();
      } catch (e) {
        setErr(e?.message ?? String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeNonGame]);

  const topPts = Math.max(1, ...overallRows.map((r) => Number(r.points) || 0));
  const topNg = Math.max(1, ...nonGameRows.map((r) => Number(r.points) || 0));

  return (
    <div className="pb-10">
      <PageHeader title="Camp standings" description="Every age group combined into one table per team." pos="50% 28%">
        <div className="seg" role="group" aria-label="Standings view" style={{ minWidth: 260 }}>
          <button
            aria-pressed={tab === "overall"}
            onClick={() => {
              setTab("overall");
              refreshTab("overall");
            }}
          >
            Overall
          </button>
          <button
            aria-pressed={tab === "non_game"}
            onClick={() => {
              setTab("non_game");
              refreshTab("non_game");
            }}
          >
            Non-game
          </button>
        </div>
        <button className="btn btn-secondary" onClick={() => refreshTab(tab)}>
          Refresh
        </button>
      </PageHeader>

      {err ? <div className="mt-4"><ErrorNote onRetry={() => refreshTab(tab)}>{err}</ErrorNote></div> : null}

      {loading ? (
        <Sheet className="mt-6" title="Standings">
          <SkeletonRows rows={4} label="Loading standings" />
        </Sheet>
      ) : (
        <>
          {/* OVERALL TAB */}
          {tab === "overall" ? (
            <section className="mt-6" aria-labelledby="overall-h">
              <div className="bc-section-head reveal">
                <h2 id="overall-h">Overall</h2>
                <label className="flex min-h-[44px] items-center gap-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={includeNonGame}
                    onChange={(e) => setIncludeNonGame(e.target.checked)}
                  />
                  Include non-game points
                </label>
              </div>

              {overallRows.length ? (
                <ul className="grid gap-3">
                  {overallRows.map((r, i) => (
                    <li key={`overall-${r.team_name}`} className={`lb-row reveal ${i === 0 ? "lead" : ""}`} style={{ "--i": i }}>
                      <div className="lb-rank">{i + 1}</div>
                      <div className="lb-name min-w-0">{r.team_name}</div>
                      <FlashNumber as="div" className="lb-val" value={Number(r.points)} />
                      <div className="lb-sub"><Meter value={r.points} max={topPts} lead={i === 0} index={i} /></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No points yet">Standings appear once a game is finalized.</EmptyState>
              )}
            </section>
          ) : null}

          {/* NON-GAME TAB */}
          {tab === "non_game" ? (
            <section className="mt-6" aria-labelledby="ng-h">
              <div className="bc-section-head reveal">
                <h2 id="ng-h">Non-game points</h2>
                <span className="bc-label">Spirit, cheering, songs, community</span>
              </div>
              {nonGameRows.length ? (
                <ul className="grid gap-3">
                  {nonGameRows.map((r, i) => (
                    <li key={`ng-${r.team_name}`} className={`lb-row reveal ${i === 0 ? "lead" : ""}`} style={{ "--i": i }}>
                      <div className="lb-rank">{i + 1}</div>
                      <div className="lb-name min-w-0">{r.team_name}</div>
                      <FlashNumber as="div" className="lb-val" value={Number(r.points)} />
                      <div className="lb-sub"><Meter value={r.points} max={topNg} lead={i === 0} index={i} /></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No non-game points yet">
                  Add them from Post Games, then Non-Game Points.
                </EmptyState>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
