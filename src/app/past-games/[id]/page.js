"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { getSportRules } from "@/lib/sportRules";

import { Sheet, ErrorNote, SkeletonRows } from "@/components/ui";
import FlashNumber from "@/components/FlashNumber";
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

// Efficiency formula per sport — used to pick "Player of the Game"
function efficiencyFor(sport, totals) {
  const s = norm(sport);
  const v = (k) => Number(totals[k] || 0);

  if (s === "hoop") return v("pts") - v("foul");
  if (s === "softball") return v("h") + v("hr") * 2;
  if (["euro", "soccer", "hockey", "speedball"].includes(s)) return v("g") * 2 + v("a");
  if (s === "football") return v("td") * 6;
  if (s === "volleyball") return v("ace") + v("kill");
  return 0;
}

export default function PastGameDetailPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params?.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useNotifyingErr();
  const [game, setGame] = useState(null);
  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);
  const [statTotals, setStatTotals] = useState({});
  const [seriesRecord, setSeriesRecord] = useState(null);

  useEffect(() => {
    if (!gameId) return;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        // None of these three depend on each other's result -- all they
        // need is gameId, which we already have -- so they run together
        // instead of one-after-another.
        const [
          { data: g, error: gErr },
          { data: roster, error: rErr },
          { data: events, error: eErr },
        ] = await Promise.all([
          // This page has no login -- anyone can load it and inspect the
          // response. Only fetch the fields actually rendered below
          // (previously select("*"), which also shipped `notes` (raw
          // game-state JSON), `timer_running`, `win_points_override`, and
          // `is_staff_game` to any anonymous visitor -- same overfetch bug
          // already fixed on the home page in 10ac85a).
          supabase
            .from("live_games")
            .select("matchup_type, team_a1, team_a2, team_b1, team_b2, score_a, score_b, league_key, sport, level, mode, is_bowl_game, bowl_name, created_at")
            .eq("id", gameId)
            .single(),
          supabase
            .from("game_roster")
            .select("game_id, player_id, player_name, team_side, team_name, sort_order")
            .eq("game_id", gameId)
            .order("team_side", { ascending: true })
            .order("sort_order", { ascending: true })
            .limit(5000),
          supabase
            .from("live_events")
            .select("player_id, stat_key, delta, event_type")
            .eq("game_id", gameId)
            .eq("event_type", "stat")
            .limit(10000),
        ]);
        if (gErr) throw gErr;
        setGame(g);

        if (rErr) throw rErr;
        setRosterA((roster || []).filter((r) => r.team_side === "A"));
        setRosterB((roster || []).filter((r) => r.team_side === "B"));

        if (eErr) throw eErr;
        const totals = {};
        for (const row of events || []) {
          const key = `${row.player_id}:${row.stat_key}`;
          totals[key] = (totals[key] || 0) + Number(row.delta || 0);
        }
        setStatTotals(totals);

        // Head-to-head series record between the two main teams in this
        // game, across every finalized game all summer — gives the
        // broadcasting kids instant "leads the season series X-Y" context.
        try {
          const teamX = norm(g.team_a1);
          const teamY = norm(g.team_b1);
          const { data: allGames } = await supabase
            .from("games")
            .select("team_a, team_a2, team_b, team_b2, score_a, score_b, deleted")
            .eq("status", "final")
            .eq("deleted", false)
            .limit(2000);

          let xWins = 0;
          let yWins = 0;
          for (const row of allGames || []) {
            const sa = Number(row.score_a || 0);
            const sb = Number(row.score_b || 0);
            if (sa === sb) continue;
            const aTeams = [row.team_a, row.team_a2].filter(Boolean).map(norm);
            const bTeams = [row.team_b, row.team_b2].filter(Boolean).map(norm);
            const aHasX = aTeams.includes(teamX);
            const aHasY = aTeams.includes(teamY);
            const bHasX = bTeams.includes(teamX);
            const bHasY = bTeams.includes(teamY);
            if ((aHasX && bHasY) || (bHasX && aHasY)) {
              const aWon = sa > sb;
              const xOnA = aHasX;
              const xWon = xOnA ? aWon : !aWon;
              if (xWon) xWins += 1;
              else yWins += 1;
            }
          }
          if (xWins + yWins > 0) {
            setSeriesRecord({ teamX, teamY, xWins, yWins });
          }
        } catch {
          // non-fatal — box score still works without series context
        }
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [gameId]);

  const rules = useMemo(() => getSportRules(game?.sport), [game?.sport]);
  const statDefs = rules?.stats ?? [];

  function playerTotals(playerId) {
    const out = {};
    for (const sd of statDefs) {
      out[sd.key] = Number(statTotals[`${playerId}:${sd.key}`] || 0);
    }
    return out;
  }

  const enrichedA = useMemo(
    () => rosterA.map((p) => ({ ...p, totals: playerTotals(p.player_id) })),
    [rosterA, statTotals, statDefs]
  );
  const enrichedB = useMemo(
    () => rosterB.map((p) => ({ ...p, totals: playerTotals(p.player_id) })),
    [rosterB, statTotals, statDefs]
  );

  const allPlayers = useMemo(() => [...enrichedA, ...enrichedB], [enrichedA, enrichedB]);

  const playerOfGame = useMemo(() => {
    if (!allPlayers.length || !statDefs.length) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const p of allPlayers) {
      const eff = efficiencyFor(game?.sport, p.totals);
      if (eff > bestScore) {
        bestScore = eff;
        best = p;
      }
    }
    if (!best || bestScore <= 0) return null;
    return { ...best, efficiency: bestScore };
  }, [allPlayers, game?.sport, statDefs]);

  // Top performer per stat category, per team
  const teamLeaders = useMemo(() => {
    if (!statDefs.length) return [];
    const out = [];
    for (const sd of statDefs) {
      for (const [label, list] of [["A", enrichedA], ["B", enrichedB]]) {
        let top = null;
        let topVal = 0;
        for (const p of list) {
          const v = Number(p.totals[sd.key] || 0);
          if (v > topVal) {
            topVal = v;
            top = p;
          }
        }
        if (top && topVal > 0) {
          out.push({ side: label, statKey: sd.key, statLabel: sd.label, player: top, value: topVal });
        }
      }
    }
    return out;
  }, [enrichedA, enrichedB, statDefs]);

  // ── Talking Points ──────────────────────────────────────────────────────
  // Auto-generated, podcast-ready sentences built purely from data already
  // computed above (margin, player of game, team leaders, series record).
  const talkingPoints = useMemo(() => {
    if (!game) return [];
    const points = [];

    const leftLabelTP = game.matchup_type === "two_team" ? matchupLabel(game.team_a1, game.team_a2) : norm(game.team_a1);
    const rightLabelTP = game.matchup_type === "two_team" ? matchupLabel(game.team_b1, game.team_b2) : norm(game.team_b1);
    const sa = Number(game.score_a || 0);
    const sb = Number(game.score_b || 0);
    const winnerName = sa > sb ? leftLabelTP : rightLabelTP;
    const loserName = sa > sb ? rightLabelTP : leftLabelTP;
    const m = Math.abs(sa - sb);

    if (m >= 15) {
      points.push(`${winnerName} dominated, beating ${loserName} by ${m} — one of the bigger margins this summer.`);
    } else if (m <= 3) {
      points.push(`A nail-biter — ${winnerName} edged out ${loserName} by just ${m}.`);
    } else {
      points.push(`${winnerName} beat ${loserName}, ${Math.max(sa, sb)}-${Math.min(sa, sb)}.`);
    }

    if (playerOfGame) {
      const line = statDefs.map((sd) => `${playerOfGame.totals[sd.key] ?? 0} ${sd.label}`).join(", ");
      points.push(`${playerOfGame.player_name || playerOfGame.player_id} led the way for ${playerOfGame.team_name} with ${line}.`);
    }

    if (teamLeaders.length) {
      const other = teamLeaders.find((tl) => tl.player.team_name !== playerOfGame?.team_name);
      if (other) {
        points.push(`${other.player.player_name || other.player.player_id} paced ${other.player.team_name} with ${other.value} ${other.statLabel}.`);
      }
    }

    if (seriesRecord) {
      const { teamX, teamY, xWins, yWins } = seriesRecord;
      if (xWins === yWins) {
        points.push(`The season series between these two teams is now tied at ${xWins}-${yWins}.`);
      } else {
        const leader = xWins > yWins ? teamX : teamY;
        const leadCount = Math.max(xWins, yWins);
        const trailCount = Math.min(xWins, yWins);
        points.push(`${leader} now leads the season series ${leadCount}-${trailCount}.`);
      }
    }

    return points;
  }, [game, playerOfGame, teamLeaders, statDefs, seriesRecord]);

  if (loading) {
    return (
      <div className="pb-10" aria-busy="true">
        <div className="bc-skel" style={{ width: 160, height: 44 }} />
        <div className="bc-card mt-4 p-5">
          <div className="bc-skel" style={{ width: "60%", height: 16 }} />
          <div className="bc-skel mt-6" style={{ height: 72 }} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
          <div className="bc-card bc-card-pad"><SkeletonRows rows={8} label="Loading box score" /></div>
          <div className="bc-card bc-card-pad"><SkeletonRows rows={4} label="Loading game details" /></div>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="pb-10 pt-4">
        <button onClick={() => router.push("/past-games")} className="btn btn-secondary btn-sm mb-4">
          Back to past games
        </button>
        <ErrorNote>{err || "Game not found."}</ErrorNote>
      </div>
    );
  }

  const leftLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_a1, game.team_a2) : norm(game.team_a1);
  const rightLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_b1, game.team_b2) : norm(game.team_b1);
  const scoreA = Number(game.score_a || 0);
  const scoreB = Number(game.score_b || 0);
  const winner = scoreA > scoreB ? leftLabel : rightLabel;
  const margin = Math.abs(scoreA - scoreB);

  function BoxScoreTable({ players, sideLabel }) {
    return (
      <Sheet title={sideLabel}>
        {statDefs.length === 0 ? (
          <div className="text-sm text-[var(--ink-2)]">No individual stats tracked for this sport.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="bc-table">
              <thead>
                <tr>
                  <th>Player</th>
                  {statDefs.map((sd) => (
                    <th key={sd.key} className="text-center">{sd.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.length === 0 ? (
                  <tr>
                    <td colSpan={statDefs.length + 1} className="py-3 text-[var(--ink-2)]">
                      No players recorded.
                    </td>
                  </tr>
                ) : (
                  players.map((p) => (
                    <tr key={p.player_id}>
                      <td className="font-bold">{p.player_name || p.player_id}</td>
                      {statDefs.map((sd) => (
                        <td key={sd.key} className={`bc-num text-center text-xl ${p.totals[sd.key] ? "" : "text-[var(--ink-3)]"}`}>
                          {p.totals[sd.key] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    );
  }

  const aWon = scoreA > scoreB;

  return (
    <div className="pb-10">
      {/* Headline board: the final, set like a stadium scoreboard */}
      <header className="cl-hero" style={{ "--hero-pos": "50% 55%" }}>
        <div className="cl-hero-bg" aria-hidden="true" />
        <div className="cl-hero-in">
          <div className="flex flex-wrap items-center gap-2 reveal">
            <button onClick={() => router.push("/past-games")} className="btn btn-secondary btn-sm">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg>
              Past games
            </button>
            <span className="bc-chip">{fmtLeague(game.league_key)}</span>
            <span className="bc-chip">{fmtSport(game.sport)}</span>
            <span className="bc-chip">Level {game.level}</span>
            <span className="bc-chip">{game.mode}</span>
            {game.is_bowl_game ? <span className="bc-chip">{String(game.bowl_name || "Bowl")}</span> : null}
          </div>
          <h1 className="sr-only">{leftLabel} vs {rightLabel} — final {scoreA} to {scoreB}</h1>

          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="min-w-0 reveal" style={{ "--i": 1 }}>
              <div className={`bc-display mb-2 text-balance text-2xl leading-[0.95] sm:text-4xl ${aWon ? "" : "text-[var(--ink-2)]"}`} style={{ textShadow: "0 2px 18px rgba(5,13,28,0.9)" }}>{leftLabel}</div>
              <FlashNumber as="div" className={`bc-num leading-[0.85] ${aWon ? "" : "text-[var(--ink-2)]"}`} value={scoreA} />
            </div>
            <div className="bc-tag-final reveal" style={{ "--i": 2 }}>Final</div>
            <div className="min-w-0 text-right reveal" style={{ "--i": 1 }}>
              <div className={`bc-display mb-2 text-balance text-2xl leading-[0.95] sm:text-4xl ${aWon ? "text-[var(--ink-2)]" : ""}`} style={{ textShadow: "0 2px 18px rgba(5,13,28,0.9)" }}>{rightLabel}</div>
              <FlashNumber as="div" className={`bc-num leading-[0.85] ${aWon ? "text-[var(--ink-2)]" : ""}`} value={scoreB} />
            </div>
          </div>
          <div className="reveal text-lg text-[var(--ink-2)]" style={{ "--i": 3 }}>
            <span className="font-bold text-[var(--good-ink)]">{winner}</span> wins by {margin} · {new Date(game.created_at).toLocaleDateString()}
          </div>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Box score */}
        <div className="space-y-6">
          <BoxScoreTable players={enrichedA} sideLabel={leftLabel} />
          <BoxScoreTable players={enrichedB} sideLabel={rightLabel} />
        </div>

        {/* Quick stats panel */}
        <div className="space-y-6">
          {playerOfGame ? (
            <Sheet title="Player of the game">
              <div className="bc-display text-5xl leading-[0.95]">{playerOfGame.player_name || playerOfGame.player_id}</div>
              <div className="bc-label mt-2">{playerOfGame.team_name}</div>
              <div className="bc-num mt-3 text-4xl">
                {statDefs.map((sd) => `${playerOfGame.totals[sd.key] ?? 0} ${sd.label}`).join(" · ")}
              </div>
            </Sheet>
          ) : null}

          {talkingPoints.length > 0 ? (
            <Sheet title="Talking points" index={1}>
              <ul className="grid gap-3">
                {talkingPoints.map((tp, i) => (
                  <li key={i} className="border-t border-[var(--rule)] pt-3 first:border-t-0 first:pt-0">{tp}</li>
                ))}
              </ul>
            </Sheet>
          ) : null}

          {seriesRecord ? (
            <Sheet title="Season series" index={2}>
              <div className="flex items-center justify-between gap-3">
                <div className={seriesRecord.xWins >= seriesRecord.yWins ? "font-bold" : "text-[var(--ink-3)]"}>
                  {seriesRecord.teamX}
                </div>
                <div className="bc-num text-5xl">
                  {seriesRecord.xWins}–{seriesRecord.yWins}
                </div>
                <div className={`text-right ${seriesRecord.yWins >= seriesRecord.xWins ? "font-bold" : "text-[var(--ink-3)]"}`}>
                  {seriesRecord.teamY}
                </div>
              </div>
            </Sheet>
          ) : null}

          {teamLeaders.length > 0 ? (
            <Sheet title="Team leaders" index={3}>
              <ul>
                {teamLeaders.map((tl, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 border-t border-[var(--rule)] py-2 first:border-t-0 first:pt-0">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-bold">{tl.player.player_name || tl.player.player_id}</div>
                      <div className="bc-label" style={{ fontSize: 13 }}>{tl.player.team_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="bc-num text-4xl leading-none">{tl.value}</div>
                      <div className="bc-label" style={{ fontSize: 13 }}>{tl.statLabel}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Sheet>
          ) : null}
        </div>
      </div>
    </div>
  );
}
