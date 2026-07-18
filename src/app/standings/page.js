"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
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
  const [err, setErr] = useState("");  const [loading, setLoading] = useState(true);

  // Tabs: overall | staff | non_game
  const [tab, setTab] = useState("overall");

  // Overall points rows from SQL function get_overall_points(include_staff, include_non_game)
  const [overallRows, setOverallRows] = useState([]);
  const [includeStaff, setIncludeStaff] = useState(true);
  const [includeNonGame, setIncludeNonGame] = useState(true);

  // Staff standings rows
  const [staffRows, setStaffRows] = useState([]);

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

  async function loadStaffStandings() {
    const { data, error } = await supabase
      .from("standings")
      .select("league_id, sport, team_name, wins, losses, league_points, updated_at")
      .eq("season", season)
      .eq("session", session)
      .eq("sport", STAFF_SPORT_KEY);

    if (error) throw error;
    setStaffRows(sortStandings(data || []));
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

  async function refreshActiveTab() {
    setErr("");
    setLoading(true);
    try {
      if (tab === "overall") {
        await loadOverallCamp();
      } else if (tab === "non_game") {
        await loadNonGamePoints();
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      setErr("");
      setLoading(true);
      try {
        await loadOverallCamp();
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, session]);

  // When toggles change, refresh overall tab automatically (only if on that tab)
  useEffect(() => {
    if (tab !== "overall") return;
    (async () => {
      setErr("");
      try {
        await loadOverallCamp();
      } catch (e) {
        setErr(e?.message ?? String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeStaff, includeNonGame, tab]);

  return (
    <div className="pb-10">
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-2xl font-black">Standings</div>
          <div className="text-sm text-white/70">
            Camp-wide standings combining every age group into one table per team.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setTab("overall");
                setTimeout(() => refreshActiveTab(), 0);
              }}
              className={`rounded-xl border px-3 py-2 text-sm font-black ${
                tab === "overall" ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
            >
              Overall
            </button>
            
            <button
              onClick={async () => {
                setTab("non_game");
                setTimeout(() => refreshActiveTab(), 0);
              }}
              className={`rounded-xl border px-3 py-2 text-sm font-black ${
                tab === "non_game" ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
            >
              Non-Game
            </button>
          </div>

          <button
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
            onClick={refreshActiveTab}
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-white/70">Loading…</div>
      ) : (
        <>
          {/* OVERALL TAB */}
          {tab === "overall" ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-lg font-black">Overall Camp Standings</div>
                  <div className="text-sm text-white/70">
                    Toggle whether to include Staff Games and Non-Game Points.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={includeNonGame}
                      onChange={(e) => setIncludeNonGame(e.target.checked)}
                    />
                    Include Non-Game
                  </label>

                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={includeStaff}
                      onChange={(e) => setIncludeStaff(e.target.checked)}
                    />
                    Include Staff
                  </label>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-white/70">
                    <tr>
                      <th className="py-2">Team</th>
                      <th className="py-2">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overallRows.length ? (
                      overallRows.map((r) => (
                        <tr key={`overall-${r.team_name}`} className="border-t border-white/10">
                          <td className="py-3 font-extrabold">{r.team_name}</td>
                          <td className="py-3 font-black">{r.points}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-white/60" colSpan={2}>
                          No overall points yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* NON-GAME TAB */}
          {tab === "non_game" ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-lg font-black">Non-Game Points</div>
              <div className="text-sm text-white/70">Spirit, cheering, songs, community, etc.</div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-white/70">
                    <tr>
                      <th className="py-2">Team</th>
                      <th className="py-2">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonGameRows.length ? (
                      nonGameRows.map((r) => (
                        <tr key={`ng-${r.team_name}`} className="border-t border-white/10">
                          <td className="py-3 font-extrabold">{r.team_name}</td>
                          <td className="py-3 font-black">{r.points}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-white/60" colSpan={2}>
                          No non-game points yet. Add them from Add Results → Non-Game Points.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}