"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { PageHeader, Field, Sheet, EmptyState, ErrorNote, SkeletonRows, ScoreBug } from "@/components/ui";
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
  const { season, session } = useAppMode();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useNotifyingErr();

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
        .eq("session", session)
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
  }, [season, session]);

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

  const anyFilter = leagueFilter || sportFilter || levelFilter || teamFilter;

  return (
    <div className="pb-10">
      <PageHeader title="Past games" description="Box scores and quick stats for every finalized game." pos="50% 45%">
        <button onClick={loadGames} className="btn btn-secondary">Refresh</button>
      </PageHeader>

      {/* Filters */}
      <Sheet className="mt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="League">
            <select className="bc-select" value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)}>
              <option value="">All leagues</option>
              {leagues.map((l) => (<option key={l} value={l}>{fmtLeague(l)}</option>))}
            </select>
          </Field>
          <Field label="Team">
            <select className="bc-select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </Field>
          <Field label="Sport">
            <select className="bc-select" value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}>
              <option value="">All sports</option>
              {sports.map((s) => (<option key={s} value={s}>{fmtSport(s)}</option>))}
            </select>
          </Field>
          <Field label="Level">
            <select className="bc-select" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="">All levels</option>
              {levels.map((l) => (<option key={l} value={l}>{l}</option>))}
            </select>
          </Field>
        </div>

        {anyFilter ? (
          <div className="mt-3 flex items-center gap-3 text-[var(--ink-2)]">
            <span>Showing {filtered.length} of {games.length} games</span>
            <button
              onClick={() => {
                setLeagueFilter("");
                setSportFilter("");
                setLevelFilter("");
                setTeamFilter("");
              }}
              className="btn btn-secondary btn-sm"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </Sheet>

      {err ? <div className="mt-4"><ErrorNote onRetry={loadGames}>{err}</ErrorNote></div> : null}

      {/* Game list */}
      <div className="bc-section-head reveal mt-8">
        <h2>Finalized games</h2>
        {loading ? null : <span className="bc-label">{filtered.length}</span>}
      </div>
      {loading ? (
        <Sheet><SkeletonRows rows={6} label="Loading games" /></Sheet>
      ) : filtered.length === 0 ? (
        <EmptyState title="No finalized games">
          {anyFilter ? "Nothing matches these filters. Try clearing one." : "Finished games show up here once they are finalized."}
        </EmptyState>
      ) : (
        <ul className="grid gap-x-5 gap-y-5 lg:grid-cols-2">
          {filtered.map((g, i) => {
            const left = g.matchup_type === "two_team" ? matchupLabel(g.team_a1, g.team_a2) : norm(g.team_a1);
            const right = g.matchup_type === "two_team" ? matchupLabel(g.team_b1, g.team_b2) : norm(g.team_b1);
            const a = Number(g.score_a || 0);
            const b = Number(g.score_b || 0);
            const winner = a > b ? left : right;

            return (
              <li key={g.id}>
                <ScoreBug
                  index={Math.min(i, 8)}
                  href={`/past-games/${g.id}`}
                  status="final"
                  a={{ name: left, score: a }}
                  b={{ name: right, score: b }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                  <span className="bc-label">{fmtLeague(g.league_key)} · {fmtSport(g.sport)} · {g.level}</span>
                  {g.is_bowl_game ? <span className="bc-chip">{String(g.bowl_name || "Bowl")}</span> : null}
                  {g.is_staff_game ? <span className="bc-chip">Staff game</span> : null}
                  <span className="ml-auto text-[15px] text-[var(--ink-3)]">
                    {new Date(g.created_at).toLocaleDateString()} · <span className="font-semibold text-[var(--good-ink)]">{winner}</span> won
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
