// ============================================================================
// COLOR WAR DISPLAY BOARD  —  src/app/display/ColorWarBoard.jsx  (NEW FILE)
// Self-contained. Rendered by display/page.js when isCW is true. Reads only
// season='cw' data. Blue vs White themed, big team names, logos, rotating
// scenes (scoreboard, stat leaders per league, live games).
// ============================================================================
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeTable } from "@/lib/useRealtimeTable";
import FlashNumber from "@/components/FlashNumber";

function norm(s) { return String(s ?? "").trim().toLowerCase(); }

// One atomic status message for the first game whose score actually changed
// — never a bare number, never one message per changed game.
function announceScoreChange(prevGames, nextGames, blueName, whiteName) {
  const prevMap = new Map((prevGames || []).map((g) => [g.id, g]));
  for (const g of nextGames || []) {
    const prev = prevMap.get(g.id);
    if (prev && (Number(prev.score_a) !== Number(g.score_a) || Number(prev.score_b) !== Number(g.score_b))) {
      const aBlue = norm(g.team_a1) === "blue";
      const left = aBlue ? blueName : whiteName;
      const right = aBlue ? whiteName : blueName;
      return `Score update: ${left} ${Number(g.score_a || 0)}, ${right} ${Number(g.score_b || 0)}`;
    }
  }
  return null;
}

const CW_SCENES = ["scoreboard", "leaders_seniors", "leaders_juniors", "leaders_sophomores", "live"];

export default function ColorWarBoard({ session = "s1", blueName, whiteName, blueLogo, whiteLogo }) {
  const [scene, setScene] = useState("scoreboard");
  const [blueTotal, setBlueTotal] = useState(0);
  const [whiteTotal, setWhiteTotal] = useState(0);
  const [byLeague, setByLeague] = useState({ seniors: { blue: 0, white: 0 }, juniors: { blue: 0, white: 0 }, sophomores: { blue: 0, white: 0 } });
  const [leaders, setLeaders] = useState({ seniors: [], juniors: [], sophomores: [] });
  const [liveGames, setLiveGames] = useState([]);
  // Screen-reader announcement of the latest live score change (WCAG 4.1.3)
  // — the totals above already update instantly via Realtime, but nothing
  // said so out loud before this.
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const prevLiveGamesRef = useRef([]);

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
        // Live CW games -- no login on this board, so only fetch fields
        // actually rendered in the "live" scene below (previously
        // select("*"), same overfetch bug already fixed on the home page
        // in 10ac85a).
        .from("live_games")
        .select("id, team_a1, league_key, sport, level, score_a, score_b")
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
      const { data: deps, error: depsErr } = await supabase.from("players").select("id").in("id", allIds).eq("departed", true);
      if (depsErr) {
        // Same silent-failure bug already fixed for Round 1 (loadErr, above)
        // and for the sibling league board's fetchLeadersForLeague — but this
        // Round 2 query was missed. Left unchecked, a failed lookup here
        // means `deps` stays undefined and no one gets filtered, so a
        // departed camper can silently keep showing up on the Color War
        // stat-leaders scene in front of the whole camp. Keep the last known
        // (already-filtered) leaders instead of showing an unfiltered list.
        console.error("ColorWarBoard departed-player filter failed, keeping last leaders state:", depsErr);
        {
          const nextLiveEarly = live || [];
          const earlyAnnouncement = announceScoreChange(prevLiveGamesRef.current, nextLiveEarly, blueName, whiteName);
          if (earlyAnnouncement) setLiveAnnouncement(earlyAnnouncement);
          prevLiveGamesRef.current = nextLiveEarly;
          setLiveGames(nextLiveEarly);
        }
        return;
      }
      const departedSet = new Set((deps || []).map((d) => String(d.id)));
      if (departedSet.size) {
        for (const lg of ["seniors", "juniors", "sophomores"]) {
          leaguesOut[lg] = leaguesOut[lg].filter((r) => !departedSet.has(String(r.player_id)));
        }
      }
    }
    setLeaders(leaguesOut);
    const nextLive = live || [];
    const announcement = announceScoreChange(prevLiveGamesRef.current, nextLive, blueName, whiteName);
    if (announcement) setLiveAnnouncement(announcement);
    prevLiveGamesRef.current = nextLive;
    setLiveGames(nextLive);
  }

  useEffect(() => {
    loadAll();
    // Safety-net poll for a silently-dropped realtime socket -- slow since
    // the realtime subscription below is doing the real work now.
    const r = setInterval(loadAll, 60000);
    return () => clearInterval(r);
  }, [session]);

  useRealtimeTable(["live_games", "live_events"], loadAll);

  // Scene rotation every 18s. Skip empty leaders scenes so it never dwells on
  // a blank board.
  //
  // leaders/liveGames are read from refs, not effect deps: loadAll() (15s
  // poll above) calls setLeaders/setLiveGames with a fresh object/array every
  // time, even when the underlying data is unchanged. Depending on them
  // directly tore this interval down and recreated it every ~15s — always
  // before the 18s rotation could fire — so the board never advanced scenes
  // on its own.
  const leadersRef = useRef(leaders);
  const liveGamesRef = useRef(liveGames);
  useEffect(() => { leadersRef.current = leaders; }, [leaders]);
  useEffect(() => { liveGamesRef.current = liveGames; }, [liveGames]);

  useEffect(() => {
    const t = setInterval(() => {
      setScene((prev) => {
        const curLeaders = leadersRef.current;
        const curLiveGames = liveGamesRef.current;
        let idx = CW_SCENES.indexOf(prev);
        for (let i = 0; i < CW_SCENES.length; i++) {
          idx = (idx + 1) % CW_SCENES.length;
          const s = CW_SCENES[idx];
          if (s === "leaders_seniors" && !curLeaders.seniors.length) continue;
          if (s === "leaders_juniors" && !curLeaders.juniors.length) continue;
          if (s === "leaders_sophomores" && !curLeaders.sophomores.length) continue;
          if (s === "live" && !curLiveGames.length) continue;
          return s;
        }
        return "scoreboard";
      });
    }, 18000);
    return () => clearInterval(t);
  }, []);

  const blueLead = blueTotal >= whiteTotal;
  const blueUrl = logoUrl(blueLogo);
  const whiteUrl = logoUrl(whiteLogo);

  function TeamCrest({ url, fallbackLetter, teamName, onBlue }) {
    const ring = onBlue ? "rgba(255,255,255,0.9)" : "var(--ink)";
    return url ? (
      <img src={url} alt={`${teamName} team crest`} loading="lazy" className="h-48 w-48 rounded-full object-cover" style={{ boxShadow: `0 0 0 6px ${ring}` }} />
    ) : (
      <div className="bc-num flex h-48 w-48 items-center justify-center rounded-full text-9xl leading-none" style={{ boxShadow: `0 0 0 6px ${ring}` }}>
        {fallbackLetter}
      </div>
    );
  }

  function statLine(sport, stat_key, value) {
    const s = norm(sport), k = String(stat_key || "").toUpperCase();
    return `${value} ${k} · ${s.toUpperCase()}`;
  }

  // Team identity swatch: a small filled square, never a colored edge.
  function Swatch({ blue }) {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 shrink-0 rounded-[3px]"
        style={blue ? { background: "var(--cw-blue)" } : { background: "#fff", boxShadow: "inset 0 0 0 2px var(--rule)" }}
      />
    );
  }

  return (
    <div data-theme="night" className="relative flex h-screen w-full flex-col overflow-hidden" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <h1 className="sr-only">Color War display board — {blueName} vs {whiteName}</h1>
      <div aria-live="polite" className="sr-only">{liveAnnouncement}</div>

      {/* Header */}
      <div className="relative z-10 flex items-end justify-between border-b-2 border-[var(--rule-strong)] px-12 py-4">
        <div className="bc-display text-7xl leading-none">Color War</div>
        <div className="text-xl font-bold uppercase tracking-[0.12em] text-[var(--ink-2)]">Camp Bauercrest</div>
      </div>

      {/* ---- SCOREBOARD: a literal split board ---- */}
      {scene === "scoreboard" && (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-2">
            {/* Blue: the team color is the field */}
            <div className="flex min-w-0 flex-col items-center justify-center gap-4 px-8" style={{ background: "var(--cw-blue)", color: "#fff" }}>
              <TeamCrest url={blueUrl} fallbackLetter="B" teamName={blueName} onBlue />
              <div className="bc-display text-balance text-center text-7xl leading-[0.95]">{blueName}</div>
              <div className="bc-num leading-[0.8]" style={{ fontSize: "clamp(9rem, 18vw, 22rem)" }}>
                <FlashNumber value={blueTotal} />
              </div>
            </div>

            {/* White */}
            <div className="flex min-w-0 flex-col items-center justify-center gap-4 px-8" style={{ background: "#f5f7fa", color: "#0b1f3b" }}>
              <TeamCrest url={whiteUrl} fallbackLetter="W" teamName={whiteName} />
              <div className="bc-display text-balance text-center text-7xl leading-[0.95]">{whiteName}</div>
              <div className="bc-num leading-[0.8]" style={{ fontSize: "clamp(9rem, 18vw, 22rem)" }}>
                <FlashNumber value={whiteTotal} />
              </div>
            </div>
          </div>

          {/* Lead flag + per-league breakdown */}
          <div className="grid grid-cols-[auto_1fr] items-stretch border-t-2 border-[var(--rule-strong)]">
            <div className="flex items-center px-12 py-4" style={{ background: "var(--ink)", color: "var(--on-ink)" }}>
              <div className="bc-display text-5xl leading-none">
                {blueTotal === whiteTotal ? "Tied" : blueLead ? `${blueName} +${blueTotal - whiteTotal}` : `${whiteName} +${whiteTotal - blueTotal}`}
              </div>
            </div>
            <div className="grid grid-cols-3">
              {["seniors", "juniors", "sophomores"].map((lg) => {
                const bl = byLeague[lg]?.blue || 0, wh = byLeague[lg]?.white || 0;
                return (
                  <div key={lg} className="flex items-center justify-between gap-6 border-l border-[var(--rule)] px-8 py-4">
                    <div className="text-xl font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">{lg}</div>
                    <div className="flex items-center gap-4">
                      <Swatch blue /><span className="bc-num text-5xl leading-none">{bl}</span>
                      <Swatch /><span className="bc-num text-5xl leading-none">{wh}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---- STAT LEADERS ---- */}
      {scene.startsWith("leaders_") && (() => {
        const lg = scene.replace("leaders_", "");
        const rows = leaders[lg] || [];
        return (
          <div className="relative z-10 flex flex-1 flex-col px-12 pt-6">
            <div className="bc-display mb-6 text-7xl leading-none">{lg} stat leaders</div>
            <div className="grid flex-1 grid-cols-3 content-start gap-6">
              {rows.map((p, i) => {
                const isBlue = norm(p.team_name) === "blue";
                return (
                  <div key={i} className="board-card p-6">
                    <div className="flex items-center gap-3 text-lg font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">
                      <Swatch blue={isBlue} />
                      {isBlue ? blueName : whiteName}
                    </div>
                    <div className="bc-display mt-2 truncate text-5xl leading-none">{p.player_name}</div>
                    <div className="bc-num mt-3 text-4xl text-[var(--ink-2)]">{statLine(p.sport, p.stat_key, p.value)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ---- LIVE GAMES ---- */}
      {scene === "live" && (
        <div className="relative z-10 flex flex-1 flex-col px-12 pt-6">
          <div className="mb-6 flex items-center gap-4">
            <span className="bc-live-badge" style={{ fontSize: 18, minHeight: 40, padding: "0 16px" }}><span className="bc-live-dot" aria-hidden="true" />Live</span>
            <div className="bc-display text-7xl leading-none">Live now</div>
          </div>
          <div className="grid flex-1 grid-cols-2 content-start gap-8">
            {liveGames.map((g) => {
              const aBlue = norm(g.team_a1) === "blue";
              return (
                <div key={g.id} className="board-card p-6">
                  <div className="text-lg font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    {g.league_key} · {g.sport} · {g.level}
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div className="flex items-center gap-3">
                      <Swatch blue={aBlue} />
                      <div className="bc-display text-4xl leading-none">{aBlue ? blueName : whiteName}</div>
                    </div>
                    <div className="bc-num text-7xl leading-none">
                      <FlashNumber value={Number(g.score_a || 0)} />–<FlashNumber value={Number(g.score_b || 0)} />
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <div className="bc-display text-4xl leading-none">{!aBlue ? blueName : whiteName}</div>
                      <Swatch blue={!aBlue} />
                    </div>
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
