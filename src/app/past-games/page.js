"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function fmtSport(s) {
  return String(s || "").toUpperCase();
}

function fmtLeague(id) {
  const s = norm(id);
  if (s === "seniors") return "Seniors";
  if (s === "juniors") return "Juniors";
  if (s === "sophomores") return "Sophomores";
  return id || "—";
}

function matchupLabel(a1, a2) {
  const x1 = norm(a1);
  const x2 = norm(a2);
  if (x1 && x2 && x1 !== x2) return `${x1} + ${x2}`;
  return x1 || "—";
}

export default function PastGamesPage() {
  const { season } = useAppMode();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [leagueFilter, setLeagueFilter] = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");

  async function loadGames() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("live_games")
        .select(
          "id, created_at, league_key, sport, level, mode, matchup_type, team_a1, team_a2, team_b1, team_b2, score_a, score_b, is_bowl_game, bowl_name, is_staff_game"
        )
        .eq("season", season)
        .eq("status", "final")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setGames(data || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGames();
  }, [season]);

  const leagues = useMemo(() => {
    const set = new Set(games.map((g) => norm(g.league_key)).filter(Boolean));
    return Array.from(set).sort();
  }, [games]);

  const sports = useMemo(() => {
    const set = new Set(games.map((g) => norm(g.sport)).filter(Boolean));
    return Array.from(set).sort();
  }, [games]);

  const levels = useMemo(() => {
    const set = new Set(games.map((g) => String(g.level || "").toUpperCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [games]);

  const teams = useMemo(() => {
    const set = new Set();
    for (const g of games) {
      [g.team_a1, g.team_a2, g.team_b1, g.team_b2].forEach((t) => {
        const n = norm(t);
        if (n) set.add(n);
      });
    }
    return Array.from(set).sort();
  }, [games]);

  const filtered = useMemo(() => {
    return games.filter((g) => {
      if (leagueFilter && norm(g.league_key) !== leagueFilter) return false;
      if (sportFilter && norm(g.sport) !== sportFilter) return false;
      if (levelFilter && String(g.level || "").toUpperCase() !== levelFilter) return false;
      if (teamFilter) {
        const gameTeams = [g.team_a1, g.team_a2, g.team_b1, g.team_b2].map(norm);
        if (!gameTeams.includes(teamFilter)) return false;
      }
      return true;
    });
  }, [games, leagueFilter, sportFilter, levelFilter, teamFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Past Games</h1>
            <div className="mt-1 text-sm text-slate-400">
              Box scores and quick stats for every finalized game.
            </div>
          </div>
          <button
            onClick={loadGames}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-4">
          <label className="text-sm">
            <div className="mb-1 text-slate-300">League</div>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
            >
              <option value="">All leagues</option>
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {fmtLeague(l)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-slate-300">Team</div>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-slate-300">Sport</div>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
            >
              <option value="">All sports</option>
              {sports.map((s) => (
                <option key={s} value={s}>
                  {fmtSport(s)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-slate-300">Level</div>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            >
              <option value="">All levels</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(leagueFilter || sportFilter || levelFilter || teamFilter) ? (
          <div className="mt-3 flex items-center gap-2">
            <div className="text-xs text-slate-400">
              Showing {filtered.length} of {games.length} games
            </div>
            <button
              onClick={() => {
                setLeagueFilter("");
                setSportFilter("");
                setLevelFilter("");
                setTeamFilter("");
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Clear filters
            </button>
          </div>
        ) : null}

        {err ? (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{err}</div>
        ) : null}

        {/* Game list */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
              Loading games…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
              No finalized games found.
            </div>
          ) : (
            filtered.map((g) => {
              const left = g.matchup_type === "two_team" ? matchupLabel(g.team_a1, g.team_a2) : norm(g.team_a1);
              const right = g.matchup_type === "two_team" ? matchupLabel(g.team_b1, g.team_b2) : norm(g.team_b1);
              const a = Number(g.score_a || 0);
              const b = Number(g.score_b || 0);
              const winner = a > b ? left : right;

              return (
                <Link
                  key={g.id}
                  href={`/past-games/${g.id}`}
                  className="block rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-600 hover:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-300">
                          {fmtLeague(g.league_key)}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-300">
                          {fmtSport(g.sport)} · {g.level}
                        </span>
                        {g.is_bowl_game ? (
                          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-black text-amber-200">
                            {String(g.bowl_name || "BOWL").toUpperCase()}
                          </span>
                        ) : null}
                        {g.is_staff_game ? (
                          <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-black text-blue-200">
                            STAFF GAME
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 text-xl font-extrabold text-white">
                        {left} <span className="text-slate-500">vs</span> {right}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(g.created_at).toLocaleDateString()} · Winner:{" "}
                        <span className="font-bold text-emerald-400">{winner}</span>
                      </div>
                    </div>

                    <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center">
                      <div className="text-2xl font-black tabular-nums text-white">
                        {a} - {b}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}