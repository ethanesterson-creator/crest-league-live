"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const SPORT_KEY = "overall";

function prettyLeague(id) {
  const x = String(id || "");
  if (x === "sophomores") return "Sophomores";
  if (x === "juniors") return "Juniors";
  if (x === "seniors") return "Seniors";
  return x;
}

export default function StandingsPage() {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState("seniors");

  const [rows, setRows] = useState([]); // current league standings rows
  const [allRows, setAllRows] = useState([]); // all leagues, for combined

  async function loadLeagues() {
    const { data, error } = await supabase
      .from("leagues")
      .select("id, name")
      .order("id", { ascending: true });

    if (error) {
      // fallback
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
      .eq("sport", SPORT_KEY)
      .eq("league_id", lid);

    if (error) throw error;

    const sorted = (data || []).sort((a, b) => {
      // Sort by league_points desc, then wins desc, then PF-PA desc
      const ap = Number(a.league_points || 0);
      const bp = Number(b.league_points || 0);
      if (bp !== ap) return bp - ap;

      const aw = Number(a.wins || 0);
      const bw = Number(b.wins || 0);
      if (bw !== aw) return bw - aw;

      const ad = Number(a.points_for || 0) - Number(a.points_against || 0);
      const bd = Number(b.points_for || 0) - Number(b.points_against || 0);
      return bd - ad;
    });

    setRows(sorted);
  }

  async function loadAllStandings() {
    const { data, error } = await supabase
      .from("standings")
      .select("league_id, sport, team_name, wins, losses, points_for, points_against, league_points")
      .eq("sport", SPORT_KEY);

    if (error) throw error;
    setAllRows(data || []);
  }

  useEffect(() => {
    (async () => {
      setErr("");
      setLoading(true);
      try {
        await loadLeagues();
        await loadAllStandings();
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

  const combined = useMemo(() => {
    // Sum all league rows into a single camp-wide table by team_name
    const map = new Map();
    for (const r of allRows) {
      const key = String(r.team_name || "").toLowerCase();
      const cur = map.get(key) || {
        team_name: r.team_name,
        league_points: 0,
        wins: 0,
        losses: 0,
        points_for: 0,
        points_against: 0,
      };
      cur.league_points += Number(r.league_points || 0);
      cur.wins += Number(r.wins || 0);
      cur.losses += Number(r.losses || 0);
      cur.points_for += Number(r.points_for || 0);
      cur.points_against += Number(r.points_against || 0);
      map.set(key, cur);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const ap = Number(a.league_points || 0);
      const bp = Number(b.league_points || 0);
      if (bp !== ap) return bp - ap;
      const aw = Number(a.wins || 0);
      const bw = Number(b.wins || 0);
      if (bw !== aw) return bw - aw;
      const ad = Number(a.points_for || 0) - Number(a.points_against || 0);
      const bd = Number(b.points_for || 0) - Number(b.points_against || 0);
      return bd - ad;
    });
    return arr;
  }, [allRows]);

  return (
    <div className="pb-10">
      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-black">Standings</div>
          <div className="text-sm text-white/70">
            Overall standings (all sports combined), weighted by points rules.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs font-bold text-white/60">League</div>
          <select
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
          >
            {(leagues?.length
              ? leagues
              : [
                  { id: "sophomores", name: "Sophomores" },
                  { id: "juniors", name: "Juniors" },
                  { id: "seniors", name: "Seniors" },
                ]
            ).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name ?? prettyLeague(l.id)}
              </option>
            ))}
          </select>

          <button
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
            onClick={async () => {
              setErr("");
              try {
                setLoading(true);
                await loadAllStandings();
                await loadStandingsForLeague(leagueId);
              } catch (e) {
                setErr(e?.message ?? String(e));
              } finally {
                setLoading(false);
              }
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-white/70">Loading…</div>
      ) : (
        <>
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

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-black">Overall Camp Standings</div>
            <div className="text-sm text-white/70">
              Combined from Sophomores + Juniors + Seniors (weighted points)
            </div>

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
                  {combined.length ? (
                    combined.map((r) => (
                      <tr key={`overall-${r.team_name}`} className="border-t border-white/10">
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
                        No overall standings yet. Finalize games in each league to populate it.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
