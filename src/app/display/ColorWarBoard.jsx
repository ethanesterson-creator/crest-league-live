// ============================================================================
// COLOR WAR DISPLAY BOARD  —  src/app/display/ColorWarBoard.jsx  (NEW FILE)
// Self-contained. Rendered by display/page.js when isCW is true. Reads only
// season='cw' data. Blue vs White themed, big team names, logos, rotating
// scenes (scoreboard, stat leaders per league, live games).
// ============================================================================
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

function norm(s) { return String(s ?? "").trim().toLowerCase(); }

const CW_SCENES = ["scoreboard", "leaders_seniors", "leaders_juniors", "leaders_sophomores", "live"];

export default function ColorWarBoard({ session = "s1", blueName, whiteName, blueLogo, whiteLogo }) {
  const [scene, setScene] = useState("scoreboard");
  const [blueTotal, setBlueTotal] = useState(0);
  const [whiteTotal, setWhiteTotal] = useState(0);
  const [byLeague, setByLeague] = useState({ seniors: { blue: 0, white: 0 }, juniors: { blue: 0, white: 0 }, sophomores: { blue: 0, white: 0 } });
  const [leaders, setLeaders] = useState({ seniors: [], juniors: [], sophomores: [] });
  const [liveGames, setLiveGames] = useState([]);

  function logoUrl(path) {
    if (!path) return null;
    try {
      const { data } = supabase.storage.from("highlights").getPublicUrl(path);
      return data?.publicUrl || null;
    } catch { return null; }
  }

  async function loadAll() {
    // Round 1: none of these four depend on each other's result, so they
    // fire together instead of one-after-another. This used to be a chain
    // of 6+ sequential round trips (including 3 separate player_totals
    // queries, one per league) running on a 15s poll all day — same
    // pattern already fixed on the league display board.
    const [
      { data: st, error: stErr },
      { data: ng, error: ngErr },
      { data: totals, error: totalsErr },
      { data: live, error: liveErr },
    ] = await Promise.all([
      // Standings for CW: rows keyed (league, blue/white). Sum per color.
      supabase
        .from("standings")
        .select("league_id, team_name, league_points")
        .eq("sport", "overall")
        .eq("season", "cw")
        .eq("session", session),
      // Non-game CW points (tugs, spirit, etc.) add to the camp-wide totals.
      supabase
        .from("non_game_points")
        .select("team_name, points")
        .eq("season", "cw")
        .eq("session", session)
        .eq("deleted", false)
        .eq("status", "final")
        .limit(5000),
      // Stat totals for all three leagues in one query instead of three.
      supabase
        .from("player_totals")
        .select("player_id, player_name, team_name, league_id, sport, stat_key, value")
        .eq("season", "cw")
        .eq("session", session)
        .in("league_id", ["seniors", "juniors", "sophomores"])
        .order("value", { ascending: false })
        .limit(500),
      // Live CW games
      supabase
        .from("live_games")
        .select("*")
        .eq("season", "cw")
        .eq("session", session)
        .eq("status", "active")
        .is("played_on", null)
        .order("updated_at", { ascending: false }),
    ]);

    // A failed fetch used to silently fall through to `|| []`, wiping the
    // board to zeroes/blank in front of the whole camp with no indication
    // anything went wrong. Now it just keeps whatever was already on screen
    // and tries again on the next 15s poll instead.
    const loadErr = stErr || ngErr || totalsErr || liveErr;
    if (loadErr) {
      console.error("ColorWarBoard loadAll failed, keeping last good state:", loadErr);
      return;
    }

    const per = { seniors: { blue: 0, white: 0 }, juniors: { blue: 0, white: 0 }, sophomores: { blue: 0, white: 0 } };
    let b = 0, w = 0;
    for (const row of st || []) {
      const lg = norm(row.league_id);
      const color = norm(row.team_name);
      const pts = Number(row.league_points || 0);
      if (per[lg] && (color === "blue" || color === "white")) per[lg][color] += pts;
      if (color === "blue") b += pts;
      if (color === "white") w += pts;
    }
    for (const row of ng || []) {
      const color = norm(row.team_name);
      const pts = Number(row.points || 0);
      if (color === "blue") b += pts;
      if (color === "white") w += pts;
    }

    setBlueTotal(b); setWhiteTotal(w); setByLeague(per);

    // Split the combined stat totals back out per league, top performers
    // across sports, one line each.
    const leaguesOut = { seniors: [], juniors: [], sophomores: [] };
    for (const lg of ["seniors", "juniors", "sophomores"]) {
      const seen = new Set();
      const rows = [];
      for (const r of totals || []) {
        if (norm(r.league_id) !== lg) continue;
        if (Number(r.value) <= 0) continue;
        const key = `${r.player_id}:${r.sport}:${r.stat_key}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(r);
        if (rows.length >= 9) break;
      }
      leaguesOut[lg] = rows;
    }

    // Round 2: depends on round 1's leader ids, so it has to come after —
    // hide departed players from the board (stats kept in DB).
    const allIds = Array.from(new Set(Object.values(leaguesOut).flat().map((r) => String(r.player_id))));
    if (allIds.length) {
      const { data: deps } = await supabase.from("players").select("id").in("id", allIds).eq("departed", true);
      const departedSet = new Set((deps || []).map((d) => String(d.id)));
      if (departedSet.size) {
        for (const lg of ["seniors", "juniors", "sophomores"]) {
          leaguesOut[lg] = leaguesOut[lg].filter((r) => !departedSet.has(String(r.player_id)));
        }
      }
    }
    setLeaders(leaguesOut);
    setLiveGames(live || []);
  }

  useEffect(() => {
    loadAll();
    const r = setInterval(loadAll, 15000);
    return () => clearInterval(r);
  }, []);

  // Scene rotation every 18s. Skip empty leaders scenes so it never dwells on
  // a blank board.
  useEffect(() => {
    const t = setInterval(() => {
      setScene((prev) => {
        let idx = CW_SCENES.indexOf(prev);
        for (let i = 0; i < CW_SCENES.length; i++) {
          idx = (idx + 1) % CW_SCENES.length;
          const s = CW_SCENES[idx];
          if (s === "leaders_seniors" && !leaders.seniors.length) continue;
          if (s === "leaders_juniors" && !leaders.juniors.length) continue;
          if (s === "leaders_sophomores" && !leaders.sophomores.length) continue;
          if (s === "live" && !liveGames.length) continue;
          return s;
        }
        return "scoreboard";
      });
    }, 18000);
    return () => clearInterval(t);
  }, [leaders, liveGames]);

  const blueLead = blueTotal >= whiteTotal;
  const blueUrl = logoUrl(blueLogo);
  const whiteUrl = logoUrl(whiteLogo);

  function TeamCrest({ url, fallbackLetter, ring }) {
    return url ? (
      <img src={url} alt="" className={`h-56 w-56 rounded-full object-cover ring-4 ${ring}`} />
    ) : (
      <div className={`flex h-56 w-56 items-center justify-center rounded-full ring-4 ${ring} bg-white/5 text-9xl font-black`}>
        {fallbackLetter}
      </div>
    );
  }

  function statLine(sport, stat_key, value) {
    const s = norm(sport), k = String(stat_key || "").toUpperCase();
    return `${value} ${k} · ${s.toUpperCase()}`;
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 text-white">
      {/* Animated split background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-blue-600/25 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white/10 to-transparent" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-16 py-6">
        <div className="text-5xl font-black tracking-[0.3em] text-blue-300">COLOR WAR</div>
        <div className="text-2xl font-bold tracking-widest text-white/40">CAMP BAUERCREST</div>
      </div>

      {/* ---- SCOREBOARD ---- */}
      {scene === "scoreboard" && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8">
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-6">
            {/* Blue */}
            <div className="flex min-w-0 flex-col items-center gap-4 px-4">
              <TeamCrest url={blueUrl} fallbackLetter="B" ring="ring-blue-400" />
              <div className="text-center text-6xl font-black uppercase leading-[0.95] tracking-wide text-blue-200 break-words"
                   style={{ textShadow: "0 0 30px rgba(59,130,246,0.6)" }}>
                {blueName}
              </div>
              <div className="text-[9rem] leading-none font-black tabular-nums text-white" style={{ textShadow: "0 0 60px rgba(59,130,246,0.7)" }}>
                {blueTotal}
              </div>
            </div>

            {/* VS + leader flag */}
            <div className="flex flex-col items-center gap-3">
              <div className="text-6xl font-black text-white/30">VS</div>
              <div className={`rounded-full px-4 py-1 text-sm font-black tracking-widest ${blueLead ? "bg-blue-500/30 text-blue-200" : "bg-white/20 text-white"}`}>
                {blueTotal === whiteTotal ? "TIED" : blueLead ? `${blueName} +${blueTotal - whiteTotal}` : `${whiteName} +${whiteTotal - blueTotal}`}
              </div>
            </div>

            {/* White */}
            <div className="flex min-w-0 flex-col items-center gap-4 px-4">
              <TeamCrest url={whiteUrl} fallbackLetter="W" ring="ring-white/70" />
              <div className="text-center text-6xl font-black uppercase leading-[0.95] tracking-wide text-white break-words"
                   style={{ textShadow: "0 0 30px rgba(255,255,255,0.5)" }}>
                {whiteName}
              </div>
              <div className="text-[9rem] leading-none font-black tabular-nums text-white" style={{ textShadow: "0 0 60px rgba(255,255,255,0.5)" }}>
                {whiteTotal}
              </div>
            </div>
          </div>

          {/* Per-league breakdown */}
          <div className="mt-12 grid w-full grid-cols-3 gap-8">
            {["seniors", "juniors", "sophomores"].map((lg) => {
              const bl = byLeague[lg]?.blue || 0, wh = byLeague[lg]?.white || 0;
              return (
                <div key={lg} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <div className="mb-3 text-center text-xl font-black uppercase tracking-widest text-white/50">{lg}</div>
                  <div className="flex items-center justify-between">
                    <div className="text-4xl font-black text-blue-300">{bl}</div>
                    <div className="text-sm font-bold text-white/30">BLUE · WHITE</div>
                    <div className="text-4xl font-black text-white">{wh}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- STAT LEADERS ---- */}
      {scene.startsWith("leaders_") && (() => {
        const lg = scene.replace("leaders_", "");
        const rows = leaders[lg] || [];
        return (
          <div className="relative z-10 flex flex-1 flex-col px-16 pt-6">
            <div className="mb-8 text-center text-6xl font-black uppercase tracking-[0.3em] text-blue-300">
              {lg} Stat Leaders
            </div>
            <div className="grid flex-1 grid-cols-3 content-center gap-6">
              {rows.map((p, i) => {
                const color = norm(p.team_name);
                return (
                  <div key={i} className={`rounded-2xl border p-4 ${color === "blue" ? "border-blue-400/40 bg-blue-500/10" : "border-white/30 bg-white/5"}`}>
                    <div className="truncate text-4xl font-black text-white">{p.player_name}</div>
                    <div className={`mt-1 text-sm font-black uppercase tracking-wider ${color === "blue" ? "text-blue-300" : "text-white/70"}`}>
                      {color === "blue" ? blueName : whiteName}
                    </div>
                    <div className="mt-2 text-lg font-bold text-white/80">{statLine(p.sport, p.stat_key, p.value)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ---- LIVE GAMES ---- */}
      {scene === "live" && (
        <div className="relative z-10 flex flex-1 flex-col px-16 pt-6">
          <div className="mb-8 text-center text-6xl font-black uppercase tracking-[0.3em] text-blue-300">Live Now</div>
          <div className="grid flex-1 grid-cols-2 content-center gap-8">
            {liveGames.map((g) => {
              const aBlue = norm(g.team_a1) === "blue";
              return (
                <div key={g.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-xs font-black uppercase tracking-widest text-white/40">
                    {g.league_key} · {g.sport} · {g.level}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className={`text-2xl font-black ${aBlue ? "text-blue-300" : "text-white"}`}>{aBlue ? blueName : whiteName}</div>
                    <div className="text-4xl font-black tabular-nums">{g.score_a} - {g.score_b}</div>
                    <div className={`text-2xl font-black ${!aBlue ? "text-blue-300" : "text-white"}`}>{!aBlue ? blueName : whiteName}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}