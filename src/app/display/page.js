"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import ColorWarBoard from "./ColorWarBoard";

const SCENES = [
  "camp",
  "spotlight",
  "rivalry",
  "finals",
  "leaders_seniors",
  "leaders_juniors",
  "leaders_sophomores",
  "highlights",
];

const SCENE_LABELS = {
  camp: "Camp Standings",
  spotlight: "Camper Spotlight",
  rivalry: "Rivalry Tracker",
  finals: "Recent Finals",
  leaders_seniors: "Seniors Stat Leaders",
  leaders_juniors: "Juniors Stat Leaders",
  leaders_sophomores: "Sophomores Stat Leaders",
  highlights: "Highlights",
};

const TICKER_MESSAGES = [];

function cx(...x) {
  return x.filter(Boolean).join(" ");
}

function fmtLeague(id) {
  if (!id) return "";
  const s = String(id).toLowerCase();
  if (s === "seniors") return "Seniors";
  if (s === "juniors") return "Juniors";
  if (s === "sophomores") return "Sophomores";
  return id;
}

function fmtSport(s) {
  return String(s || "").toUpperCase();
}

function fmtClock(d) {
  return new Date(d).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeRivalries(rows) {
  const records = {};

  function pairKey(x, y) {
    return [x, y].sort().join("||");
  }

  for (const g of rows || []) {
    if (g.deleted) continue;
    const sa = Number(g.score_a || 0);
    const sb = Number(g.score_b || 0);
    if (sa === sb) continue;

    const aTeams = [g.team_a, g.team_a2].filter(Boolean).map((t) => String(t).toLowerCase());
    const bTeams = [g.team_b, g.team_b2].filter(Boolean).map((t) => String(t).toLowerCase());

    const aWon = sa > sb;
    const winners = aWon ? aTeams : bTeams;
    const losers = aWon ? bTeams : aTeams;

    for (const w of winners) {
      for (const l of losers) {
        if (w === l) continue;
        const key = pairKey(w, l);
        if (!records[key]) {
          const [t1, t2] = key.split("||");
          records[key] = { t1, t2, t1Wins: 0, t2Wins: 0 };
        }
        const r = records[key];
        if (r.t1 === w) r.t1Wins += 1;
        else r.t2Wins += 1;
      }
    }
  }

  return Object.values(records).sort((a, b) => (a.t1 + a.t2).localeCompare(b.t1 + b.t2));
}

export default function DisplayPage() {
  const { isCW, blueName, whiteName, blueLogo, whiteLogo, loading: modeLoading } = useAppMode();
  const [scene, setScene] = useState("camp");

  const [campStandings, setCampStandings] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
  const [finalGames, setFinalGames] = useState([]);
  const [leadersByLeague, setLeadersByLeague] = useState({ seniors: [], juniors: [], sophomores: [] });
  const [highlights, setHighlights] = useState([]);
  const [spotlight, setSpotlight] = useState([]);

  const [rotateSeconds, setRotateSeconds] = useState(18);
  const [autoRotate, setAutoRotate] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [now, setNow] = useState(Date.now());

  
  const [rivalries, setRivalries] = useState([]);


  const wrapRef = useRef(null);

  async function loadAll() {
   // camp standings — aggregate points across all leagues per team, INCLUDING non-game points
   const { data: allStandings } = await supabase
  .from("standings")
  .select("team_name, league_points")
  .eq("sport", "overall");

 // Sum league_points per team_name across all leagues
 const totalsMap = {};
 (allStandings || []).forEach((row) => {
  const name = String(row.team_name || "").trim().toLowerCase();
  if (!name) return;
  totalsMap[name] = (totalsMap[name] || 0) + Number(row.league_points || 0);
 });

 // Add non-game points on top, same as the public Standings "Overall" tab
 const { data: ngStandingsData } = await supabase
  .from("non_game_points")
  .select("team_name, points")
  .eq("deleted", false)
  .eq("status", "final")
  .limit(5000);

 (ngStandingsData || []).forEach((row) => {
  const name = String(row.team_name || "").trim().toLowerCase();
  if (!name) return;
  totalsMap[name] = (totalsMap[name] || 0) + Number(row.points || 0);
 });

 const aggregated = Object.entries(totalsMap)
  .map(([team_name, league_points]) => ({ team_name, league_points }))
  .sort((a, b) => b.league_points - a.league_points);

 setCampStandings(aggregated);
    // live games
    const { data: live } = await supabase
      .from("live_games")
      .select("*")
      .eq("status", "active")
      .is("played_on", null)
      .order("updated_at", { ascending: false });

    setLiveGames(live || []);

    // finals
    const { data: finals } = await supabase
      .from("games")
      .select("*")
      .eq("status", "final")
      .eq("deleted", false)
      .order("updated_at", { ascending: false })
      .limit(12);

    setFinalGames(finals || []);

    // leaders — fetch ALL THREE leagues independently. Each league's stat
    // leaders is its own dedicated scene now, so all three need their own
    // data on every load, not just whichever league happens to be selected.
    async function fetchLeadersForLeague(lid) {
      const { data: leaderPool } = await supabase
        .from("player_totals")
        .select("*")
        .eq("league_id", lid)
        .eq("season", "league")
        .order("value", { ascending: false })
        .limit(500);

      // Hide departed players (kept in DB, just not shown on the board).
      let pool = leaderPool || [];
      const ids = Array.from(new Set(pool.map((r) => String(r.player_id))));
      if (ids.length) {
        const { data: deps } = await supabase.from("players").select("id").in("id", ids).eq("departed", true);
        const departedSet = new Set((deps || []).map((d) => String(d.id)));
        if (departedSet.size) pool = pool.filter((r) => !departedSet.has(String(r.player_id)));
      }

      const bestPerCategory = new Map();
      for (const row of pool) {
        const key = `${String(row.sport || "").toLowerCase()}:${String(row.stat_key || "").toLowerCase()}`;
        const existing = bestPerCategory.get(key);
        if (!existing || Number(row.value || 0) > Number(existing.value || 0)) {
          bestPerCategory.set(key, row);
        }
      }

      return Array.from(bestPerCategory.values()).sort(
        (a, b) => Number(b.value || 0) - Number(a.value || 0)
      );
    }

    const [seniorsLeaders, juniorsLeaders, sophomoresLeaders] = await Promise.all([
      fetchLeadersForLeague("seniors"),
      fetchLeadersForLeague("juniors"),
      fetchLeadersForLeague("sophomores"),
    ]);

    setLeadersByLeague({
      seniors: seniorsLeaders,
      juniors: juniorsLeaders,
      sophomores: sophomoresLeaders,
    });

    // rivalry tracker — every finalized game, head-to-head across the whole summer
    const { data: allFinalGames } = await supabase
      .from("games")
      .select("team_a, team_a2, team_b, team_b2, score_a, score_b, deleted")
      .eq("status", "final")
      .eq("deleted", false)
      .limit(2000);

    setRivalries(computeRivalries(allFinalGames || []));

    // camper spotlight — top 3 individual performances from last 12 hours
    try {
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

      const { data: recentGames } = await supabase
        .from("live_games")
        .select("id, sport, league_key")
        .eq("status", "final")
        .gte("updated_at", cutoff);

      const recentIds = (recentGames || []).map((g) => g.id);

      if (recentIds.length === 0) {
        setSpotlight([]);
      } else {
        const gameMap = {};
        for (const g of recentGames || []) gameMap[g.id] = g;

        const { data: evts } = await supabase
          .from("live_events")
          .select("game_id, player_id, stat_key, delta")
          .eq("event_type", "stat")
          .in("game_id", recentIds)
          .limit(20000);

        const { data: rosters } = await supabase
          .from("game_roster")
          .select("game_id, player_id, player_name, team_name")
          .in("game_id", recentIds)
          .limit(5000);

        const rosterMap = {};
        for (const r of rosters || []) {
          rosterMap[`${r.game_id}::${r.player_id}`] = r;
        }

        // Aggregate stats per player per game
        const perPlayerGame = {};
        for (const e of evts || []) {
          if (!e.stat_key) continue;
          const k = `${e.game_id}::${e.player_id}`;
          if (!perPlayerGame[k]) {
            perPlayerGame[k] = { game_id: e.game_id, player_id: e.player_id, stats: {} };
          }
          perPlayerGame[k].stats[e.stat_key] = (perPlayerGame[k].stats[e.stat_key] || 0) + Number(e.delta || 0);
        }

        function eff(sport, stats) {
          const s = String(sport || "").toLowerCase();
          const v = (k) => Number(stats[k] || 0);
          if (s === "hoop") return v("pts") - v("foul");
          if (s === "softball") return v("h") + v("hr") * 2;
          if (["euro", "soccer", "hockey", "speedball"].includes(s)) return v("g") * 2 + v("a");
          if (s === "football") return v("td") * 6;
          if (s === "volleyball") return v("ace") + v("kill");
          return 0;
        }

        const allScored = Object.values(perPlayerGame)
          .map((entry) => {
            const g = gameMap[entry.game_id];
            const r = rosterMap[`${entry.game_id}::${entry.player_id}`];
            const score = eff(g?.sport, entry.stats);
            if (score <= 0) return null;
            return {
              player_name: r?.player_name || entry.player_id,
              team_name: r?.team_name || "",
              sport: g?.sport || "",
              game_id: entry.game_id,
              stats: entry.stats,
              score,
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);

        // Enforce variety: one player per game, one per sport
        const usedGames = new Set();
        const usedSports = new Set();
        const scored = [];

        for (const p of allScored) {
          if (scored.length >= 3) break;
          if (usedGames.has(p.game_id)) continue;
          if (usedSports.has(String(p.sport).toLowerCase())) continue;
          usedGames.add(p.game_id);
          usedSports.add(String(p.sport).toLowerCase());
          scored.push(p);
        }

        // Fallback: relax sport constraint if we don't have 3 yet
        if (scored.length < 3) {
          for (const p of allScored) {
            if (scored.length >= 3) break;
            if (usedGames.has(p.game_id)) continue;
            if (scored.find((s) => s.player_name === p.player_name)) continue;
            usedGames.add(p.game_id);
            scored.push(p);
          }
        }

        setSpotlight(scored);
      }
    } catch {
      setSpotlight([]);
    }

    // highlights
    const { data: h } = await supabase
      .from("highlights")
      .select("*")
      .eq("show_on_board", true)
      .order("created_at", { ascending: false });

    setHighlights(h || []);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const t = setInterval(() => {
      loadAll();
    }, 15000);

    return () => clearInterval(t);
  }, [autoRefresh]);

 useEffect(() => {
    if (!autoRotate) return;

    // Pure linear rotation. Each league's stat leaders is now its own
    // hardcoded scene (leaders_seniors, leaders_juniors, leaders_sophomores),
    // so no shared "league" variable needs to be mutated during rotation —
    // each scene is self-contained and always shows the right league.
    const t = setInterval(() => {
      setScene((prevScene) => {
        const idx = SCENES.indexOf(prevScene);
        const safeIdx = idx === -1 ? 0 : idx;
        const nextScene = SCENES[(safeIdx + 1) % SCENES.length];

        return nextScene;
      });
    }, rotateSeconds * 1000);

    return () => clearInterval(t);
  }, [autoRotate, rotateSeconds]);

 const tickerItems = useMemo(() => {
  const live = liveGames.slice(0, 4).map((g) => {
    const left = g.team_a || g.team_a1 || "Team A";
    const right = g.team_b || g.team_b1 || "Team B";
    const leagueName = fmtLeague(g.league_id || g.league_key);
    return `LIVE: ${leagueName} ${fmtSport(g.sport)} — ${left} ${Number(g.score_a || 0)}-${Number(g.score_b || 0)} ${right}`;
  });

  const finals = finalGames.slice(0, 6).map((g) => {
    const a = Number(g.score_a || 0);
    const b = Number(g.score_b || 0);
    const sideA = [g.team_a, g.team_a2].filter(Boolean).join(" + ");
    const sideB = [g.team_b, g.team_b2].filter(Boolean).join(" + ");
    const winner = a > b ? sideA : sideB;
    const loser = a > b ? sideB : sideA;
    const bowl = g.is_bowl_game ? `${String(g.bowl_name || "BOWL").toUpperCase()}: ` : "";
    return `FINAL: ${bowl}${winner} defeats ${loser}, ${Math.max(a, b)}-${Math.min(a, b)}`;
  });

  const topStandings = campStandings.slice(0, 3).map((t, i) => {
    return `CAMP STANDINGS: #${i + 1} ${t.team_name} — ${Number(t.league_points || 0)} pts`;
  });

  const allLeaders = [
    ...(leadersByLeague.seniors || []),
    ...(leadersByLeague.juniors || []),
    ...(leadersByLeague.sophomores || []),
  ];

  const topLeaders = allLeaders.slice(0, 4).map((p) => {
    return `LEADER: ${p.player_name} — ${Number(p.value || 0)} ${String(p.stat_key || "").toUpperCase()} (${p.team_name || "—"})`;
  });

  return [...live, ...finals, ...topStandings, ...topLeaders].filter(Boolean);
}, [liveGames, finalGames, campStandings, leadersByLeague]);

  async function goFullscreen() {
    if (!document.fullscreenElement) {
      await wrapRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  /* ===== DATA HELPERS ===== */
      function renderRivalries() {
    if (!rivalries.length) {
      return (
        <div className="flex h-full items-center justify-center text-2xl font-black text-white/40">
          No head-to-head results yet.
        </div>
      );
    }

    return (
      <div className="h-full rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-950 to-slate-900 p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.3em] text-blue-500">Camp-Wide</div>
            <div className="text-5xl font-black text-white">Rivalry Tracker</div>
          </div>
          <div className="rounded-2xl border border-blue-500/40 bg-blue-500/15 px-6 py-4">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-300">ALL-TIME SERIES</div>
          </div>
        </div>

        <div className="grid h-[calc(100%-160px)] grid-cols-1 gap-5 overflow-y-auto xl:grid-cols-2">
          {rivalries.map((r) => {
            const leaderIsT1 = r.t1Wins > r.t2Wins;
            const leaderIsT2 = r.t2Wins > r.t1Wins;
            return (
              <div
                key={`${r.t1}-${r.t2}`}
                className="flex items-center justify-between rounded-[28px] border border-white/10 bg-white/[0.04] px-8 py-7"
              >
                <div className={cx("truncate text-3xl font-black", leaderIsT1 ? "text-white" : "text-white/50")}>
                  {r.t1}
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className={cx("text-6xl font-black tabular-nums", leaderIsT1 ? "text-blue-400" : "text-white/40")}>
                    {r.t1Wins}
                  </div>
                  <div className="text-2xl font-black text-white/30">–</div>
                  <div className={cx("text-6xl font-black tabular-nums", leaderIsT2 ? "text-blue-400" : "text-white/40")}>
                    {r.t2Wins}
                  </div>
                </div>
                <div className={cx("truncate text-right text-3xl font-black", leaderIsT2 ? "text-white" : "text-white/50")}>
                  {r.t2}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderSpotlight() {
    if (typeof window === "undefined") return null;
    const medals = ["#FFD700", "#C0C0C0", "#CD7F32"];
    const ranks = ["#1", "#2", "#3"];

    function statLine(sport, stats) {
      const s = String(sport || "").toLowerCase();
      const v = (k) => Number(stats[k] || 0);
      let parts = [];
      if (s === "hoop") parts = [[v("pts"), "PTS"], [v("foul"), "F"]];
      else if (s === "softball") parts = [[v("h"), "H"], [v("hr"), "HR"]];
      else if (["euro", "soccer", "hockey", "speedball"].includes(s)) parts = [[v("g"), "G"], [v("a"), "A"]];
      else if (s === "football") parts = [[v("td"), "TD"]];
      else parts = Object.entries(stats).map(([k, val]) => [val, k.toUpperCase()]);
      const nonZero = parts.filter(([val]) => val > 0);
      return (nonZero.length ? nonZero : parts.slice(0, 1)).map(([val, label]) => `${val} ${label}`).join(" · ");
    }

    if (!spotlight.length) {
      return (
        <div className="flex h-full items-center justify-center text-2xl font-black text-white/40">
          No performances tracked yet — check back after tonight's games.
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.3em] text-blue-400">Recent</div>
            <div className="text-5xl font-black text-white">Camper Spotlight</div>
          </div>
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-6 py-3 text-sm font-black uppercase tracking-widest text-blue-300">
            Top Performances
          </div>
        </div>

        <div className={`grid flex-1 gap-6 ${spotlight.length === 3 ? "grid-cols-3" : spotlight.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {spotlight.map((p, i) => (
            <div
              key={i}
              className="relative flex flex-col justify-between overflow-hidden rounded-[40px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-10"
              style={{ boxShadow: `0 0 60px ${medals[i]}18` }}
            >
              {/* Rank badge */}
              <div
                className="absolute right-8 top-8 text-6xl font-black tabular-nums opacity-20"
                style={{ color: medals[i] }}
              >
                {ranks[i]}
              </div>

              {/* Sport tag */}
              <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/50">
                  {String(p.sport).toUpperCase()}
                </span>
              </div>

              {/* Name + team */}
              <div className="mt-6 flex-1">
                <div
                  className="text-5xl font-black leading-tight text-white xl:text-6xl"
                  style={{ textShadow: `0 0 40px ${medals[i]}60` }}
                >
                  {p.player_name}
                </div>
                <div className="mt-3 text-xl font-black uppercase tracking-widest" style={{ color: medals[i] }}>
                  {p.team_name}
                </div>
              </div>

              {/* Stat line */}
              <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 px-6 py-5">
                <div className="text-xs font-black uppercase tracking-widest text-white/30">Stat Line</div>
                <div className="mt-2 text-3xl font-black tabular-nums text-white xl:text-4xl">
                  {statLine(p.sport, p.stats)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderFinals() {
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {finalGames.map((g) => (
          <div
            key={g.id}
            className="rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 to-black p-8"
          >
            <div className="text-sm font-black uppercase tracking-[0.2em] text-blue-400">
              FINAL
            </div>

            <div className="mt-3 text-lg font-black text-white/60">
              {fmtLeague(g.league_id)} • {fmtSport(g.sport)}
            </div>

            <div className="mt-5 text-3xl font-black text-white">
              {g.team_a}
            </div>

            <div className="my-5 text-center text-6xl font-black text-blue-400">
              {g.score_a} - {g.score_b}
            </div>

            <div className="text-right text-3xl font-black text-white">
              {g.team_b}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderLeaders(leagueKey) {
    const leaders = leadersByLeague[leagueKey] || [];
    return (
      <div className="flex h-full flex-col gap-6">
        <div className="text-sm font-black uppercase tracking-[0.3em] text-blue-400">
          {fmtLeague(leagueKey)} Stat Leaders
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {leaders.slice(0, 9).map((p) => (
          <div
            key={`${String(p.sport || "").toLowerCase()}-${String(p.stat_key || "").toLowerCase()}`}
            className="rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 to-black p-8"
          >
            <div className="text-sm font-black uppercase tracking-[0.2em] text-blue-400">
              STAT LEADER
            </div>

            <div className="mt-4 text-4xl font-black text-white">
              {p.player_name}
            </div>

            <div className="mt-2 text-xl font-bold text-white/60">
              {p.team_name}
            </div>

            <div className="mt-8 flex items-end justify-between">
              <div>
                <div className="text-lg font-black uppercase text-white/50">
                  {p.stat_key}
                </div>

                <div className="text-7xl font-black text-blue-400">
                  {p.value}
                </div>
              </div>

              <div className="text-sm font-black uppercase tracking-widest text-white/40">
                {fmtSport(p.sport)}
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>
    );
  }

 function renderHighlights() {
    if (!highlights.length) return (
      <div className="flex h-full items-center justify-center text-white/40 text-2xl font-black">
        No highlights yet.
      </div>
    );

    // Time-derived index: advances every 8s since page load, immune to
    // re-renders, data refreshes, and remounts. `now` already ticks every
    // second in this component, keeping this fresh.
    const safeIndex = Math.floor(Date.now() / 8000) % highlights.length;
    const h = highlights[safeIndex];

    const { data } = supabase.storage
      .from("highlights")
      .getPublicUrl(h.file_path);

    const url = data?.publicUrl;

    return (
      <div className="grid grid-cols-1 gap-8 h-full">
        <div className="overflow-hidden rounded-[40px] border border-white/10 bg-black">
          <div className="border-b border-white/10 bg-gradient-to-r from-blue-700 to-blue-500 px-8 py-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.3em] text-white/70">
                FEATURED HIGHLIGHT
              </div>
              <div className="mt-1 text-4xl font-black text-white">
                {h.title || "Camp Highlight"}
              </div>
            </div>
            <div className="text-sm font-black text-white/50">
              {safeIndex + 1} / {highlights.length}
            </div>
          </div>

          <div className="h-[calc(100%-96px)] bg-black">
            {h.file_type === "video" ? (
              <video
                key={h.id}
                src={url}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-contain"
              />
            ) : (
              <img
                key={h.id}
                src={url}
                alt=""
                className="h-full w-full object-contain"
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ===== MAIN RETURN ===== */
    if (isCW) {
      return <ColorWarBoard blueName={blueName} whiteName={whiteName} blueLogo={blueLogo} whiteLogo={whiteLogo} />;
    }

    return (
    <main
      ref={wrapRef}
      className="relative min-h-screen overflow-hidden bg-[#050509] text-white"
    >
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(58,113,255,0.30),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(30,64,175,0.22),transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:48px_48px] opacity-[0.08]" />
      </div>

      {/* Top compact ESPN-style header */}
      <header className="relative z-10 flex h-[72px] items-center justify-between border-b border-white/10 bg-black/65 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 rounded-xl border border-blue-400/30 bg-black/40 px-4 py-2 shadow-[0_0_18px_rgba(58,113,255,0.35)]">
            <span
              className="text-2xl font-black italic tracking-tighter"
              style={{
                color: "#bcd4ff",
                textShadow: "0 0 6px #5b8cff, 0 0 14px #3a71ff, 0 0 22px rgba(58,113,255,0.6)",
              }}
            >
              CBSN
            </span>
          </div>

          <div className="hidden text-sm font-black uppercase tracking-[0.25em] text-white/50 md:block">
            Camp Bauercrest Sports Network
          </div>
        </div>

        <div className="flex items-center gap-3">

          <button
            onClick={loadAll}
            className="h-10 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black hover:bg-white/20"
          >
            Refresh
          </button>

          <button
            onClick={() => setAutoRefresh((x) => !x)}
            className="h-10 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black hover:bg-white/20"
          >
            Auto {autoRefresh ? "On" : "Off"}
          </button>

          <button
            onClick={() => setAutoRotate((x) => !x)}
            className="h-10 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black hover:bg-white/20"
          >
            Rotate {autoRotate ? "On" : "Off"}
          </button>

          <button
            onClick={goFullscreen}
            className="h-10 rounded-xl border border-blue-500/40 bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-500"
          >
            Fullscreen
          </button>

          <div className="hidden h-10 items-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black tabular-nums text-white/80 lg:flex">
            {fmtClock(now)}
          </div>
        </div>
      </header>

      {/* Scene tabs compact row */}
      <section className="relative z-10 flex h-[58px] items-center justify-between border-b border-white/10 bg-[#0b0b10]/80 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {SCENES.map((s) => (
            <button
              key={s}
              onClick={() => setScene(s)}
              className={cx(
                "h-10 rounded-xl px-4 text-sm font-black uppercase tracking-wide transition",
                scene === s
                  ? "bg-white text-black shadow-lg"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {SCENE_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-xs font-black uppercase tracking-[0.25em] text-white/40 md:block">
            Current Scene
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-black uppercase tracking-wide text-blue-300">
            {SCENE_LABELS[scene]}
          </div>

          <select
            value={rotateSeconds}
            onChange={(e) => setRotateSeconds(Number(e.target.value))}
            className="h-10 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-black text-white outline-none"
          >
            <option value={12}>12s</option>
            <option value={18}>18s</option>
            <option value={25}>25s</option>
            <option value={35}>35s</option>
          </select>
        </div>
      </section>

      {/* Main board area */}
      <section className="relative z-10 h-[calc(100vh-72px-58px-52px)] p-6">
        <div className="h-full overflow-hidden">
          {scene === "camp" && (
            <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-950 to-slate-900 p-8 shadow-2xl">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.3em] text-blue-500">
                    Camp-Wide
                  </div>
                  <div className="text-5xl font-black text-white">
                    Overall Camp Standings
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-500/40 bg-blue-500/15 px-6 py-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-blue-300">
                    ALL AGE GROUPS
                  </div>
                </div>
              </div>

              <div className="grid h-[calc(100%-160px)] grid-cols-1 gap-6 xl:grid-cols-2">
                {campStandings.map((t, i) => (
                  <div
                    key={`${t.league_id}-${t.team_name}-${i}`}
                    className={cx(
                      "flex items-center justify-between rounded-[32px] border border-white/10 bg-white/[0.04] p-10",
                      i === 0 && "border-blue-500/40 bg-blue-500/10"
                    )}
                  >
                    <div>
                      <div className="text-lg font-black uppercase tracking-[0.2em] text-white/40">
                        #{i + 1} • ALL LEAGUES
                       </div>
                      <div className="mt-2 text-6xl font-black text-white xl:text-7xl">
                        {t.team_name}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-black uppercase tracking-[0.2em] text-blue-300">
                        POINTS
                      </div>
                      <div className="text-8xl font-black text-blue-400 xl:text-9xl">
                        {Number(t.league_points || 0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scene === "rivalry" && renderRivalries()}
          {scene === "finals" && renderFinals()}
          {scene === "spotlight" && renderSpotlight()}
          {scene === "leaders_seniors" && renderLeaders("seniors")}
          {scene === "leaders_juniors" && renderLeaders("juniors")}
          {scene === "leaders_sophomores" && renderLeaders("sophomores")}
          {scene === "highlights" && renderHighlights()}
        </div>
      </section>

      {/* Bottom ticker */}
      <Ticker items={tickerItems} />

      {/* Error overlay */}
      {false && (
        <div className="absolute right-4 top-24 z-50 rounded-xl border border-blue-500/30 bg-blue-950/90 px-4 py-3 text-sm font-bold text-blue-100">
          Error loading board
        </div>
      )}
    </main>
  );
}

/* ===== BOTTOM COMPONENTS ===== */
function Ticker({ items }) {
  const text = items && items.length ? items.join("     •     ") : "";
  if (!text) return null;
  return (
    <footer className="absolute bottom-0 left-0 right-0 z-20 flex h-[52px] overflow-hidden border-t-2 border-blue-400/60 bg-[#0a1530] shadow-[0_-4px_20px_rgba(58,113,255,0.25)]">
      <div className="flex shrink-0 items-center bg-black px-5">
        <div
          className="text-sm font-black uppercase tracking-[0.25em]"
          style={{ color: "#bcd4ff", textShadow: "0 0 8px #3a71ff" }}
        >
          CBSN Ticker
        </div>
      </div>

      <div className="relative flex flex-1 items-center overflow-hidden">
        <div className="animate-[ticker_55s_linear_infinite] whitespace-nowrap px-8 text-xl font-black uppercase tracking-wide text-white">
          {text}     •     {text}
        </div>
      </div>

      <style jsx>{`
        @keyframes ticker {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </footer>
  );
}