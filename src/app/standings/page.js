"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const LEAGUE_SPORT_KEY = "overall"; // your age-league standings live under standings.sport='overall'
const STAFF_SPORT_KEY = "staff";    // staff standings should live under standings.sport='staff'

function prettyLeague(id) {
  const x = String(id || "");
  if (x === "sophomores") return "Sophomores";
  if (x === "juniors") return "Juniors";
  if (x === "seniors") return "Seniors";
  return x;
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

    const ad = Number(a.points_for || 0) - Number(a.points_against || 0);
    const bd = Number(b.points_for || 0) - Number(b.points_against || 0);
    return bd - ad;
  });
  return rows;
}

export default function StandingsPage() {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState("seniors");

  // Tabs: league | overall | staff | non_game
  const [tab, setTab] = useState("league");

  // League standings rows
  const [rows, setRows] = useState([]);

  // Overall points rows from SQL function get_overall_points(include_staff, include_non_game)
  const [overallRows, setOverallRows] = useState([]);
  const [includeStaff, setIncludeStaff] = useState(true);
  const [includeNonGame, setIncludeNonGame] = useState(true);

  // Staff standings rows
  const [staffRows, setStaffRows] = useState([]);

  // Non-game points totals by team
  const [nonGameRows, setNonGameRows] = useState([]);

  async function loadLeagues() {
    const { data, error } = await supabase
      .from("leagues")
      .select("id, name")
      .order("id", { ascending: true });

    if (error) {
      setLeagues([
        { id: "sophomores", name: "Sophomores" },
        { id: "juniors", name: "Juniors" },
        { id: "seniors", name: "Seniors" },
      ]);
      return;
    }
    setLeagues(data || []);
  }

  async function loadStandingsForLeague(lid) {
    const { data, error } = await supabase
      .from("standings")
      .select("league_id, sport, team_name, wins, losses, points_for, points_against, league_points, updated_at")
      .eq("sport", LEAGUE_SPORT_KEY)
      .eq("league_id", lid);

    if (error) throw error;
    setRows(sortStandings(data || []));
  }

  async function loadOverallCamp() {
    // Uses the SQL function we added earlier
    const { data, error } = await supabase.rpc("get_overall_points", {
      include_staff: includeStaff,
      include_non_game: includeNonGame,
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
      .select("league_id, sport, team_name, wins, losses, points_for, points_against, league_points, updated_at")
      .eq("sport", STAFF_SPORT_KEY);

    if (error) throw error;
    setStaffRows(sortStandings(data || []));
  }

  async function loadNonGamePoints() {
    const { data, error } = await supabase
      .from("non_game_points")
      .select("team_name, points, status, deleted")
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
      if (tab === "league") {
        await loadStandingsForLeague(leagueId);
      } else if (tab === "overall") {
        await loadOverallCamp();
      } else if (tab === "staff") {
        await loadStaffStandings();
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
        await loadLeagues();
        // Load initial tab
        await loadStandingsForLeague(leagueId);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab !== "league") return;
    (async () => {
      setErr("");
      try {
        await loadStandingsForLeague(leagueId);
      } catch (e) {
        setErr(e?.message ?? String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

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

  const leagueOptions = useMemo(
    () =>
      leagues?.length
        ? leagues
        : [
            { id: "sophomores", name: "Sophomores" },
            { id: "juniors", name: "Juniors" },
            { id: "seniors", name: "Seniors" },
          ],
    [leagues]
  );

  return (
    <div className="pb-10">
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-2xl font-black">Standings</div>
          <div className="text-sm text-white/70">
            League standings + overall camp standings, with staff and non-game point options.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("league")}
              className={`rounded-xl border px-3 py-2 text-sm font-black ${
                tab === "league" ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
            >
              League
            </button>
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
                setTab("staff");
                setTimeout(() => refreshActiveTab(), 0);
              }}
              className={`rounded-xl border px-3 py-2 text-sm font-black ${
                tab === "staff" ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
            >
              Staff
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

          {/* League selector only applies to League tab */}
          {tab === "league" ? (
            <>
              <div className="ml-2 text-xs font-bold text-white/60">League</div>
              <select
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
                value={leagueId}
                onChange={(e) => setLeagueId(e.target.value)}
              >
                {leagueOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name ?? prettyLeague(l.id)}
                  </option>
                ))}
              </select>
            </>
          ) : null}

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
          {/* LEAGUE TAB */}
          {tab === "league" ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-lg font-black">{prettyLeague(leagueId)} Standings</div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-white/70">
                    <tr>
                      <th className="py-2">Team</th>
                      <th className="py-2">W</th>
                      <th className="py-2">L</th>
                      <th className="py-2">PF</th>
                      <th className="py-2">PA</th>
                      <th className="py-2">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      rows.map((r) => (
                        <tr key={`${r.league_id}-${r.team_name}`} className="border-t border-white/10">
                          <td className="py-3 font-extrabold">{r.team_name}</td>
                          <td className="py-3">{r.wins}</td>
                          <td className="py-3">{r.losses}</td>
                          <td className="py-3">{r.points_for}</td>
                          <td className="py-3">{r.points_against}</td>
                          <td className="py-3 font-black">{r.league_points}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-white/60" colSpan={6}>
                          No standings yet for this league. Finalize a game to populate it.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

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

          {/* STAFF TAB */}
          {tab === "staff" ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-lg font-black">Staff Standings</div>
              <div className="text-sm text-white/70">Points and record from staff games.</div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-white/70">
                    <tr>
                      <th className="py-2">Team</th>
                      <th className="py-2">W</th>
                      <th className="py-2">L</th>
                      <th className="py-2">PF</th>
                      <th className="py-2">PA</th>
                      <th className="py-2">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffRows.length ? (
                      staffRows.map((r) => (
                        <tr key={`staff-${r.team_name}`} className="border-t border-white/10">
                          <td className="py-3 font-extrabold">{r.team_name}</td>
                          <td className="py-3">{r.wins}</td>
                          <td className="py-3">{r.losses}</td>
                          <td className="py-3">{r.points_for}</td>
                          <td className="py-3">{r.points_against}</td>
                          <td className="py-3 font-black">{r.league_points}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-white/60" colSpan={6}>
                          No staff standings yet. Finalize a staff game to populate it.
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
