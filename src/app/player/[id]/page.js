"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

  const [player, setPlayer] = useState(null);
  const [totals, setTotals] = useState([]);      // combined stat totals
  const [bySession, setBySession] = useState({ s1: [], s2: [] });
  const [wins, setWins] = useState(0);
  const [games, setGames] = useState(0);
  const [bestGame, setBestGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true); setErr("");
      try {
        const { data: p } = await supabase
          .from("players").select("*").eq("id", id).maybeSingle();
        setPlayer(p);

        // All stat totals across sessions
        const { data: t } = await supabase
          .from("player_totals")
          .select("session, sport, stat_key, value")
          .eq("player_id", id);
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

        // Wins + games via roster
        const { data: rosters } = await supabase
          .from("game_roster").select("game_id, team_side").eq("player_id", id).eq("is_playing", true).limit(2000);
        const gids = (rosters || []).map((r) => r.game_id);
        if (gids.length) {
          const { data: gm } = await supabase
            .from("live_games").select("id, score_a, score_b").eq("status", "final").in("id", gids);
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

        // Best single game
        const { data: evts } = await supabase
          .from("live_events").select("game_id, sport, stat_key, delta")
          .eq("event_type", "stat").eq("player_id", id).limit(5000);
        const perGame = {};
        for (const e of evts || []) {
          perGame[e.game_id] = perGame[e.game_id] || { sport: e.sport, stats: {} };
          const k = String(e.stat_key).toUpperCase();
          perGame[e.game_id].stats[k] = (perGame[e.game_id].stats[k] || 0) + Number(e.delta || 0);
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

  if (loading) return <div className="mt-10 text-white/70">Loading…</div>;
  if (!player) return (
    <div className="mt-10">
      <div className="text-lg font-black">Player not found.</div>
      <Link href="/leaders" className="mt-2 inline-block text-sm text-blue-300 underline">Back to Leaders</Link>
    </div>
  );

  const fullName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  const bothSessions = player.active_session === "s2" && player.s1_team;

  return (
    <div className="pb-16">
      {/* Hero */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-950/60 via-slate-900 to-slate-950">
        <div className="flex flex-col items-center gap-4 p-8 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-white/5 text-5xl font-black ring-2 ring-white/10">
            {(player.first_name?.[0] || "") + (player.last_name?.[0] || "")}
          </div>
          <div className="text-center sm:text-left">
            <div className="text-4xl font-black">{fullName}</div>
            <div className="mt-1 text-sm font-bold uppercase tracking-widest text-white/50">
              {fmtLeague(player.league_id)} · {player.team_name} {player.bunk ? `· Bunk ${player.bunk}` : ""}
            </div>
            <div className="mt-2 text-xs font-bold text-blue-300">
              {bothSessions ? "Both Sessions" : player.active_session === "s2" ? "Session 2" : "Session 1"}
            </div>
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
        <div className="text-lg font-black">Career Stat Totals</div>
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