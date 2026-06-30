"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

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
  const [err, setErr] = useState("");
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
        const { data: g, error: gErr } = await supabase
          .from("live_games")
          .select("*")
          .eq("id", gameId)
          .single();
        if (gErr) throw gErr;
        setGame(g);

        const { data: roster, error: rErr } = await supabase
          .from("game_roster")
          .select("game_id, player_id, player_name, team_side, team_name, sort_order")
          .eq("game_id", gameId)
          .order("team_side", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(5000);
        if (rErr) throw rErr;

        setRosterA((roster || []).filter((r) => r.team_side === "A"));
        setRosterB((roster || []).filter((r) => r.team_side === "B"));

        const { data: events, error: eErr } = await supabase
          .from("live_events")
          .select("player_id, stat_key, delta, event_type")
          .eq("game_id", gameId)
          .eq("event_type", "stat")
          .limit(10000);
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

    const sa = Number(game.score_a || 0);
    const sb = Number(game.score_b || 0);
    const winnerName = sa > sb ? leftLabel : rightLabel;
    const loserName = sa > sb ? rightLabel : leftLabel;
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
  }, [game, leftLabel, rightLabel, playerOfGame, teamLeaders, statDefs, seriesRecord]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Loading box score…
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-red-300">
        {err || "Game not found."}
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 text-lg font-extrabold text-white">{sideLabel}</div>
        {statDefs.length === 0 ? (
          <div className="text-sm text-slate-500">No individual stats tracked for this sport.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-2">Player</th>
                  {statDefs.map((sd) => (
                    <th key={sd.key} className="py-1.5 px-2 text-center">{sd.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.length === 0 ? (
                  <tr>
                    <td colSpan={statDefs.length + 1} className="py-3 text-slate-500">
                      No players recorded.
                    </td>
                  </tr>
                ) : (
                  players.map((p) => (
                    <tr key={p.player_id} className="border-t border-slate-800">
                      <td className="py-1.5 pr-2 font-bold text-white">{p.player_name || p.player_id}</td>
                      {statDefs.map((sd) => (
                        <td key={sd.key} className="py-1.5 px-2 text-center font-bold tabular-nums text-slate-200">
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl p-4">
        <button
          onClick={() => router.push("/past-games")}
          className="mb-4 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
        >
          ← Back to Past Games
        </button>

        {/* Header / Final Score */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <span>{fmtLeague(game.league_key)}</span>
            <span>·</span>
            <span>{fmtSport(game.sport)}</span>
            <span>·</span>
            <span>Level {game.level}</span>
            <span>·</span>
            <span>{game.mode}</span>
            {game.is_bowl_game ? (
              <span className="ml-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                {String(game.bowl_name || "BOWL").toUpperCase()}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-3 items-center gap-4">
            <div className="text-right sm:text-left">
              <div className="text-lg font-black text-white sm:text-2xl">{leftLabel}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-black tabular-nums text-white sm:text-5xl">
                {scoreA} - {scoreB}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-lg font-black text-white sm:text-2xl">{rightLabel}</div>
            </div>
          </div>

          <div className="mt-3 text-center text-sm text-slate-400">
            <span className="font-bold text-emerald-400">{winner}</span> wins by {margin}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          {/* Box score */}
          <div className="space-y-4">
            <BoxScoreTable players={enrichedA} sideLabel={leftLabel} />
            <BoxScoreTable players={enrichedB} sideLabel={rightLabel} />
          </div>

          {/* Quick Stats panel */}
          <div className="space-y-4">
            {talkingPoints.length > 0 ? (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-950/20 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-blue-300">Talking Points</div>
                <div className="mt-3 space-y-2">
                  {talkingPoints.map((tp, i) => (
                    <div key={i} className="rounded-lg border border-blue-500/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                      {tp}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {seriesRecord ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Season Series</div>
                <div className="mt-3 flex items-center justify-between">
                  <div className={seriesRecord.xWins >= seriesRecord.yWins ? "text-base font-black text-white" : "text-base font-bold text-slate-400"}>
                    {seriesRecord.teamX}
                  </div>
                  <div className="text-2xl font-black tabular-nums text-emerald-300">
                    {seriesRecord.xWins} - {seriesRecord.yWins}
                  </div>
                  <div className={seriesRecord.yWins >= seriesRecord.xWins ? "text-base font-black text-white" : "text-base font-bold text-slate-400"}>
                    {seriesRecord.teamY}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-300">Quick Stats</div>

              {playerOfGame ? (
                <div className="mt-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Player of the Game</div>
                  <div className="mt-1 text-lg font-black text-white">
                    {playerOfGame.player_name || playerOfGame.player_id}
                  </div>
                  <div className="text-xs text-slate-400">{playerOfGame.team_name}</div>
                  <div className="mt-1 text-sm text-emerald-300">
                    {statDefs.map((sd) => `${playerOfGame.totals[sd.key] ?? 0} ${sd.label}`).join(" · ")}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">No stats tracked for this sport.</div>
              )}
            </div>

            {teamLeaders.length > 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Team Leaders</div>
                <div className="mt-3 space-y-2">
                  {teamLeaders.map((tl, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div>
                        <div className="text-sm font-bold text-white">{tl.player.player_name || tl.player.player_id}</div>
                        <div className="text-[11px] text-slate-500">{tl.player.team_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black tabular-nums text-emerald-300">{tl.value}</div>
                        <div className="text-[10px] uppercase text-slate-500">{tl.statLabel}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Game Info</div>
              <div className="mt-2 space-y-1 text-sm text-slate-300">
                <div>Date: {new Date(game.created_at).toLocaleDateString()}</div>
                <div>Final: {scoreA} - {scoreB}</div>
                <div>Margin: {margin}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}