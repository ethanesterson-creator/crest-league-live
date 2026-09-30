"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { useAppMode } from "@/lib/useAppMode";

function norm(s) { return String(s ?? "").trim().toLowerCase(); }
function fmtLeague(id) {
  const s = norm(id);
  if (s === "seniors") return "Seniors";
  if (s === "juniors") return "Juniors";
  if (s === "sophomores") return "Sophomores";
  return id || "—";
}

export default function PlayerProfilePage() {
  const params = useParams();
  const id = params?.id;
  const { session } = useAppMode();

  const [player, setPlayer] = useState(null);
  const [totals, setTotals] = useState([]);      // combined stat totals
  const [bySession, setBySession] = useState({ s1: [], s2: [] });
  const [wins, setWins] = useState(0);
  const [games, setGames] = useState(0);
  const [bestGame, setBestGame] = useState(null);
  const [badges, setBadges] = useState([]); // award podium finishes for this player
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useNotifyingErr();

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true); setErr("");
      try {
        // These four only need `id`, not each other's result, so they run
        // together instead of one-after-another.
        const [
          { data: p, error: pErr },
          { data: t, error: tErr },
          { data: rosters, error: rErr },
          { data: evts, error: eErr },
          { data: awardRows },
        ] = await Promise.all([
          // This page has no login -- anyone with the link gets this
          // response. Only fetch the fields actually rendered below, not
          // every players column (previously select("*"), which also
          // shipped `role` and `departed` to fully anonymous requests for
          // no reason).
          supabase
            .from("players")
            .select("id, first_name, last_name, league_id, team_name, s1_team, active_session, bunk")
            .eq("id", id)
            .maybeSingle(),
          // All stat totals across sessions
          supabase
            .from("player_totals")
            .select("session, sport, stat_key, value")
            .eq("player_id", id),
          // Wins + games via roster
          supabase
            .from("game_roster")
            .select("game_id, team_side")
            .eq("player_id", id)
            .eq("is_playing", true)
            .limit(2000),
          // Best single game. live_events has no sport column of its own
          // (confirmed live: "column live_events.sport does not exist",
          // despite CLAUDE.md's schema notes claiming otherwise) -- this
          // silently broke this entire page for every visitor until caught
          // here. Sport is derived from each event's game in Round 2 below.
          supabase
            .from("live_events")
            .select("game_id, stat_key, delta")
            .eq("event_type", "stat")
            .eq("player_id", id)
            .limit(5000),
          // Trading-card badges: any award podium finish (gold/silver/bronze)
          // this player holds this session. Non-fatal if it fails -- badges
          // are a nice-to-have, not core profile data.
          supabase.rpc("get_awards", { p_session: session }).then(
            (res) => res,
            () => ({ data: [] })
          ),
        ]);
        if (pErr) throw pErr;
        if (tErr) throw tErr;
        if (rErr) throw rErr;
        if (eErr) throw eErr;
        setPlayer(p);
        setBadges((awardRows || []).filter((r) => String(r.o_player_id) === String(id)).sort((a, b) => a.o_rank - b.o_rank));

        const rows = (t || []).filter((r) => Number(r.value) > 0);

        // Combined (sum across sessions by sport+stat)
        const combined = {};
        for (const r of rows) {
          const k = `${r.sport}|${r.stat_key}`;
          combined[k] = combined[k] || { sport: r.sport, stat_key: r.stat_key, value: 0 };
          combined[k].value += Number(r.value || 0);
        }
        setTotals(Object.values(combined).sort((a, b) => b.value - a.value));
        setBySession({
          s1: rows.filter((r) => r.session === "s1"),
          s2: rows.filter((r) => r.session === "s2"),
        });

        // Round 2: depends on round 1's roster result (game ids), so it has
        // to come after.
        const gids = (rosters || []).map((r) => r.game_id);
        if (gids.length) {
          const { data: gm, error: gmErr } = await supabase
            .from("live_games").select("id, score_a, score_b").eq("status", "final").in("id", gids);
          if (gmErr) throw gmErr;
          const byId = {}; for (const g of gm || []) byId[g.id] = g;
          let w = 0, played = 0;
          for (const r of rosters || []) {
            const g = byId[r.game_id]; if (!g) continue;
            played++;
            const won = (r.team_side === "A" && Number(g.score_a) > Number(g.score_b)) ||
                        (r.team_side === "B" && Number(g.score_b) > Number(g.score_a));
            if (won) w++;
          }
          setWins(w); setGames(played);
        }

        const perGame = {};
        for (const e of evts || []) {
          perGame[e.game_id] = perGame[e.game_id] || { stats: {} };
          const k = String(e.stat_key).toUpperCase();
          perGame[e.game_id].stats[k] = (perGame[e.game_id].stats[k] || 0) + Number(e.delta || 0);
        }

        // Round 2: depends on round 1's event game ids, so it has to come
        // after -- fetches each game's sport (see the comment on the
        // live_events query above for why this can't just be e.sport).
        const bestGameIds = Object.keys(perGame);
        if (bestGameIds.length) {
          const { data: gamesForBest } = await supabase.from("live_games").select("id, sport").in("id", bestGameIds);
          const sportById = {};
          for (const g of gamesForBest || []) sportById[g.id] = g.sport;
          for (const gk of bestGameIds) perGame[gk].sport = sportById[gk] || "";
        }

        let best = null;
        for (const gk of Object.keys(perGame)) {
          const g = perGame[gk];
          for (const sk of Object.keys(g.stats)) {
            if (!best || g.stats[sk] > best.value) best = { value: g.stats[sk], stat: sk, sport: g.sport };
          }
        }
        setBestGame(best);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return (
    <div className="pb-16 animate-pulse">
      <div className="mt-6 h-48 rounded-3xl border border-white/10 bg-white/5" />
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="h-20 rounded-2xl border border-white/10 bg-white/5" />
        <div className="h-20 rounded-2xl border border-white/10 bg-white/5" />
        <div className="h-20 rounded-2xl border border-white/10 bg-white/5" />
      </div>
    </div>
  );
  // A fetch error also leaves `player` null, same as a genuinely missing
  // player -- check `err` first so a transient failure doesn't render as
  // "Player not found" for a real player.
  if (err) return (
    <div className="mt-10 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div>
  );
  if (!player) return (
    <div className="mt-10">
      <div className="text-lg font-black">Player not found.</div>
      <Link href="/leaders" className="mt-2 inline-block text-sm text-blue-300 underline">Back to Leaders</Link>
    </div>
  );

  const fullName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  const bothSessions = player.active_session === "s2" && player.s1_team;

  const hasAward = badges.length > 0;

  return (
    <div className="pb-16">
      {/* Hero — a trading-card treatment: gold frame + glow once this player
          holds any award podium spot, same gold language as /awards. */}
      <div
        className="mt-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-blue-950/60 via-slate-900 to-slate-950"
        style={hasAward
          ? { borderColor: "rgba(245,196,81,.35)", boxShadow: "0 0 60px rgba(245,196,81,.10)" }
          : { borderColor: "rgba(255,255,255,.1)" }}
      >
        <div className="flex flex-col items-center gap-4 p-8 sm:flex-row sm:items-end sm:gap-6">
          <div
            className="flex h-32 w-32 items-center justify-center rounded-2xl bg-white/5 text-5xl font-black ring-2"
            style={{ borderColor: "transparent", boxShadow: hasAward ? "0 0 0 2px rgba(245,196,81,.4)" : undefined }}
          >
            {(player.first_name?.[0] || "") + (player.last_name?.[0] || "")}
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-4xl font-black">{fullName}</h1>
            <div className="mt-1 text-sm font-bold uppercase tracking-widest text-white/50">
              {fmtLeague(player.league_id)} · {player.team_name} {player.bunk ? `· Bunk ${player.bunk}` : ""}
            </div>
            <div className="mt-2 text-xs font-bold text-blue-300">
              {bothSessions ? "Both Sessions" : player.active_session === "s2" ? "Session 2" : "Session 1"}
            </div>

            {hasAward ? (
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                {badges.map((b) => (
                  <span
                    key={`${b.o_award}-${b.o_rank}`}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black"
                    style={{ borderColor: "rgba(245,196,81,.35)", background: "var(--bc-gold-soft)", color: "#f5c451" }}
                  >
                    {b.o_rank === 1 ? "🥇" : b.o_rank === 2 ? "🥈" : "🥉"} {b.o_award_label || b.o_award}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {err ? <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div> : null}

      {/* Top-line stats */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-3xl font-black">{wins}</div>
          <div className="text-xs font-bold uppercase tracking-widest text-white/50">Wins</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-3xl font-black">{games}</div>
          <div className="text-xs font-bold uppercase tracking-widest text-white/50">Games</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-3xl font-black">{games ? Math.round((wins / games) * 100) : 0}%</div>
          <div className="text-xs font-bold uppercase tracking-widest text-white/50">Win Rate</div>
        </div>
      </div>

      {/* Best game */}
      {bestGame ? (
        <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-amber-200/70">Best Single Game</div>
          <div className="mt-1 text-2xl font-black text-amber-100">
            {bestGame.value} {bestGame.stat} · {String(bestGame.sport).toUpperCase()}
          </div>
        </div>
      ) : null}

      {/* Stat totals */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-black">Career Stat Totals</h2>
        <div className="mt-1 text-xs text-white/50">Combined across all sessions.</div>
        {totals.length ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {totals.map((t, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                <div className="text-2xl font-black">{t.value}</div>
                <div className="text-xs font-bold uppercase tracking-wide text-white/50">
                  {String(t.stat_key).toUpperCase()} · {String(t.sport).toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-white/50">No stats recorded yet.</div>
        )}
      </div>

      <div className="mt-6">
        <Link href="/leaders" className="text-sm text-blue-300 underline">← Back to Leaders</Link>
      </div>
    </div>
  );
}