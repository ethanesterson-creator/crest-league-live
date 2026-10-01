"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { useAppMode } from "@/lib/useAppMode";

import { Sheet, EmptyState, ErrorNote, SkeletonRows, Meter } from "@/components/ui";
import FlashNumber from "@/components/FlashNumber";
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
    <div className="pb-16" aria-busy="true">
      <div className="bc-card mt-6 p-6">
        <div className="bc-skel" style={{ width: "50%", height: 48 }} />
        <div className="bc-skel mt-4" style={{ width: "70%", height: 16 }} />
      </div>
      <div className="bc-card mt-5 p-6"><SkeletonRows rows={3} label="Loading player" /></div>
    </div>
  );
  // A fetch error also leaves `player` null, same as a genuinely missing
  // player -- check `err` first so a transient failure doesn't render as
  // "Player not found" for a real player.
  if (err) return (
    <div className="mt-10"><ErrorNote>{err}</ErrorNote></div>
  );
  if (!player) return (
    <div className="mt-10">
      <EmptyState title="Player not found">
        That player may have been removed, or the link is wrong.
        <div className="mt-4"><Link href="/leaders" className="btn btn-secondary btn-sm">Back to leaders</Link></div>
      </EmptyState>
    </div>
  );

  const fullName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  const bothSessions = player.active_session === "s2" && player.s1_team;
  const hasAward = badges.length > 0;
  const maxTotal = Math.max(1, ...totals.map((t) => Number(t.value) || 0));

  return (
    <div className="pb-16">
      {/* Player card hero */}
      <header className="cl-hero cl-banquet" style={{ "--hero-pos": "40% 70%" }}>
        <div className="cl-hero-bg" aria-hidden="true" />
        <div className="cl-hero-in">
          <Link href="/leaders" className="btn btn-secondary btn-sm self-start reveal">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg>
            Leaders
          </Link>
          <div className="flex items-center gap-5 sm:gap-7">
            <div
              className="bc-num reveal grid h-24 w-24 shrink-0 place-items-center sm:h-36 sm:w-36"
              style={{ "--i": 1, background: "var(--ink)", color: "var(--on-ink)", clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)", fontSize: "clamp(44px, 9vw, 72px)", lineHeight: 1, letterSpacing: "0.02em" }}
              aria-hidden="true"
            >
              {(player.first_name?.[0] || "") + (player.last_name?.[0] || "")}
            </div>
            <div className="min-w-0">
              <h1 className="bc-page-title reveal" style={{ "--i": 1, fontSize: "clamp(40px, 9vw, 84px)" }}>{fullName}</h1>
              <div className="bc-label mt-2 reveal" style={{ "--i": 2, fontSize: 16 }}>
                {fmtLeague(player.league_id)} · {player.team_name}{player.bunk ? ` · Bunk ${player.bunk}` : ""} · {bothSessions ? "Both sessions" : player.active_session === "s2" ? "Session 2" : "Session 1"}
              </div>
              {hasAward ? (
                <div className="mt-3 flex flex-wrap gap-2 reveal" style={{ "--i": 3 }}>
                  {badges.map((b) => (
                    <span
                      key={`${b.o_award}-${b.o_rank}`}
                      className="bc-chip"
                      style={{ background: "color-mix(in srgb, var(--banquet) 22%, transparent)", color: "var(--banquet)" }}
                    >
                      {b.o_rank === 1 ? "1st" : b.o_rank === 2 ? "2nd" : "3rd"} · {b.o_award_label || b.o_award}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {err ? <div className="mt-4"><ErrorNote>{err}</ErrorNote></div> : null}

      {/* Top-line record: one scoreboard strip, scaled by importance */}
      <dl className="stat-strip reveal mt-6" style={{ "--i": 1 }}>
        <div>
          <dd className="bc-num text-5xl leading-[0.9] sm:text-6xl"><FlashNumber value={Number(wins)} /></dd>
          <dt className="bc-label mt-1">Wins</dt>
        </div>
        <div>
          <dd className="bc-num text-5xl leading-[0.9] sm:text-6xl"><FlashNumber value={Number(games)} /></dd>
          <dt className="bc-label mt-1">Games</dt>
        </div>
        <div>
          <dd className="bc-num text-7xl leading-[0.85] sm:text-8xl"><FlashNumber value={games ? Math.round((wins / games) * 100) : 0} />%</dd>
          <dt className="bc-label mt-1">Win rate</dt>
        </div>
      </dl>

      {/* Best game */}
      {bestGame ? (
        <section className="reveal mt-6 flex flex-wrap items-center justify-between gap-3 p-5" style={{ "--i": 3, background: "linear-gradient(100deg, #1c4fa8, #0e2150)", boxShadow: "inset 0 0 0 1px var(--accent-2)", clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))" }}>
          <h2 className="bc-label" style={{ fontSize: 16 }}>Best single game</h2>
          <div className="bc-display text-5xl leading-none">
            {bestGame.value} {bestGame.stat} · {String(bestGame.sport)}
          </div>
        </section>
      ) : null}

      {/* Stat totals */}
      <Sheet className="mt-6" title="Career stat totals" meta="All sessions" index={4}>
        {totals.length ? (
          <ul>
            {totals.map((t, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-t border-[var(--rule)] py-3 first:border-t-0">
                <div>
                  <span className="text-xl font-bold uppercase">{String(t.stat_key)}</span>
                  <span className="bc-label ml-3">{String(t.sport)}</span>
                </div>
                <FlashNumber as="div" className="bc-num text-4xl leading-none" value={Number(t.value)} />
                <div className="col-span-2"><Meter value={t.value} max={maxTotal} index={i} /></div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No stats yet">Stats show up here after this player&apos;s first finalized game.</EmptyState>
        )}
      </Sheet>
    </div>
  );
}
