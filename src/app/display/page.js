"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import ColorWarBoard from "./ColorWarBoard";

// BANQUET MODE — set true for the last-night banquet board (gold + navy,
// champions first, no CBSN blue). Set back to false to return to normal.
const BANQUET = true;

const SCENES_BANQUET = ["champions", "awards", "spotlight", "highlights"];
const SCENES_NORMAL = [
  "camp",
  "spotlight",
  "averages",
  "awards",
  "finals",
  "leaders_seniors",
  "leaders_juniors",
  "leaders_sophomores",
  "highlights",
];
const SCENES = BANQUET ? SCENES_BANQUET : SCENES_NORMAL;

const SCENE_LABELS = {
  champions: "League Champions",
  camp: "Camp Standings",
  spotlight: "Camper Spotlight",
  averages: "Per Game Leaders",
  awards: "Crest Awards",
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

// Isolated so its 1x/second tick never re-renders the rest of the board —
// same fix already proven on the live scoring page (see comment there about
// eaten taps from a page re-rendering every 250ms).
function LiveClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return fmtClock(now);
}

// Same isolation as LiveClock: this used to re-render every second by
// forcing the WHOLE board to re-render via top-level `now` state, even when
// this scene wasn't visible. Now it only ticks (and only re-renders) itself,
// and only while it's actually mounted (i.e. the highlights scene is showing).
function HighlightsScene({ highlights }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!highlights.length) return (
    <div className="flex h-full items-center justify-center text-white/40 text-2xl font-black">
      No highlights yet.
    </div>
  );

  // Time-derived index: advances every 8s since page load, immune to
  // re-renders, data refreshes, and remounts.
  const safeIndex = Math.floor(Date.now() / 8000) % highlights.length;
  const h = highlights[safeIndex];

  const { data } = supabase.storage
    .from("highlights")
    .getPublicUrl(h.file_path);

  const url = data?.publicUrl;

  return (
    <div className="grid grid-cols-1 gap-8 h-full">
      <div className="overflow-hidden rounded-[40px] border border-white/10 bg-black">
        <div className="border-b px-8 py-4 flex items-center justify-between" style={{ borderColor: "rgba(245,196,81,0.3)", background: "linear-gradient(90deg, #0b1f3b, #08172c)" }}>
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

export default function DisplayPage() {
  const { isCW, session, blueName, whiteName, blueLogo, whiteLogo, loading: modeLoading } = useAppMode();
  const [scene, setScene] = useState("camp");

  const [campStandings, setCampStandings] = useState([]);
  const [champions, setChampions] = useState({});
  const [liveGames, setLiveGames] = useState([]);
  const [finalGames, setFinalGames] = useState([]);
  const [leadersByLeague, setLeadersByLeague] = useState({ seniors: [], juniors: [], sophomores: [] });
  const [highlights, setHighlights] = useState([]);
  const [spotlight, setSpotlight] = useState([]);

  const [rotateSeconds, setRotateSeconds] = useState(18);
  const [autoRotate, setAutoRotate] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [avgLeaders, setAvgLeaders] = useState({ seniors: [], juniors: [], sophomores: [] });
  const [awards, setAwards] = useState([]);
  const [avgPage, setAvgPage] = useState(0);


  const wrapRef = useRef(null);

  // leaders — fetch ALL THREE leagues independently. Each league's stat
  // leaders is its own dedicated scene now, so all three need their own
  // data on every load, not just whichever league happens to be selected.
  async function fetchLeadersForLeague(lid, session) {
    const { data: leaderPool, error } = await supabase
      .from("player_totals")
      .select("player_id, sport, stat_key, value, player_name, team_name")
      .eq("league_id", lid)
      .eq("season", "league")
      .eq("session", session)
      .order("value", { ascending: false })
      .limit(500);
    if (error) throw error;

    // Hide departed players (kept in DB, just not shown on the board).
    let pool = leaderPool || [];
    const ids = Array.from(new Set(pool.map((r) => String(r.player_id))));
    if (ids.length) {
      const { data: deps, error: depsErr } = await supabase.from("players").select("id").in("id", ids).eq("departed", true);
      if (depsErr) throw depsErr;
      const departedSet = new Set((deps || []).map((d) => String(d.id)));
      if (departedSet.size) pool = pool.filter((r) => !departedSet.has(String(r.player_id)));
    }

    const bestPerCategory = new Map();
    for (const row of pool) {
      if (Number(row.value || 0) <= 0) continue; // never show a 0 as a "leader"
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

  // camper spotlight — top 3 individual performances from last 12 hours.
  // Isolated in its own try/catch (as before) so a spotlight-only failure
  // can never take down the rest of the board.
  async function loadSpotlight(session, cutoff) {
    try {
      const { data: recentGames } = await supabase
        .from("live_games")
        .select("id, sport, league_key")
        .eq("status", "final")
        .eq("season", "league")
        .eq("session", session)
        .gte("updated_at", cutoff);

      const recentIds = (recentGames || []).map((g) => g.id);
      if (recentIds.length === 0) return [];

      const gameMap = {};
      for (const g of recentGames || []) gameMap[g.id] = g;

      const [{ data: evts }, { data: rosters }] = await Promise.all([
        supabase
          .from("live_events")
          .select("game_id, player_id, stat_key, delta")
          .eq("event_type", "stat")
          .in("game_id", recentIds)
          .limit(20000),
        supabase
          .from("game_roster")
          .select("game_id, player_id, player_name, team_name")
          .in("game_id", recentIds)
          .limit(5000),
      ]);

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

      return scored;
    } catch {
      return [];
    }
  }

  async function loadAll() {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    // A failed fetch used to silently fall through to `|| []`, wiping
    // sections of the board to zero/blank in front of the whole camp with
    // no indication anything went wrong (same bug already fixed in
    // ColorWarBoard's loadAll, commit 755cd49). Now it just keeps whatever
    // was already on screen and tries again on the next 15s poll instead.
    try {

    // ---- Round 1: every query below is independent of every other one —
    // none of them need another query's result to run — so they all fire
    // together instead of one-after-another. This is the single biggest
    // lever on load time: this used to be ~15 sequential round trips to
    // Supabase on every 15s poll, which is what made the board (and the
    // rest of the app, same pattern) feel slow all season. ----
    const [
      standingsRes,
      ngStandingsRes,
      liveRes,
      finalsRes,
      seniorsLeaders,
      juniorsLeaders,
      sophomoresLeaders,
      avgTotalsRes,
      avgGamesRes,
      awardsRes,
      spotlightScored,
      highlightsRes,
    ] = await Promise.all([
      // Same "standings" rows drive both camp-wide totals AND per-league
      // champions below — used to be fetched twice, now just once.
      supabase
        .from("standings")
        .select("league_id, team_name, wins, losses, league_points")
        .eq("sport", "overall")
        .eq("season", "league")
        .eq("session", session),
      supabase
        .from("non_game_points")
        .select("team_name, points")
        .eq("deleted", false)
        .eq("status", "final")
        .eq("season", "league")
        .eq("session", session)
        .limit(5000),
      // This board has no login -- anyone can load it and inspect the
      // response. Only fetch fields actually rendered in the ticker/finals
      // panels below (previously select("*"), same overfetch bug already
      // fixed on the home page in 10ac85a).
      supabase
        .from("live_games")
        .select("id, sport, league_key, team_a, team_a1, team_a2, team_b, team_b1, team_b2, score_a, score_b")
        .eq("status", "active")
        .eq("season", "league")
        .eq("session", session)
        .is("played_on", null)
        .order("updated_at", { ascending: false }),
      supabase
        .from("live_games")
        .select("id, sport, league_key, team_a, team_a1, team_a2, team_b, team_b1, team_b2, score_a, score_b")
        .eq("status", "final")
        .eq("season", "league")
        .eq("session", session)
        .order("updated_at", { ascending: false })
        .limit(12),
      fetchLeadersForLeague("seniors", session),
      fetchLeadersForLeague("juniors", session),
      fetchLeadersForLeague("sophomores", session),
      supabase
        .from("player_totals")
        .select("league_id, sport, player_id, player_name, team_name, stat_key, value")
        .eq("season", "league")
        .eq("session", session)
        .limit(20000),
      supabase
        .from("live_games")
        .select("id, sport")
        .eq("status", "final")
        .eq("season", "league")
        .eq("session", session)
        .limit(5000),
      supabase.rpc("get_awards", { p_session: session }),
      loadSpotlight(session, cutoff),
      supabase
        .from("highlights")
        .select("*")
        .eq("show_on_board", true)
        .order("created_at", { ascending: false }),
    ]);

    const round1Err =
      standingsRes.error || ngStandingsRes.error || liveRes.error || finalsRes.error ||
      avgTotalsRes.error || avgGamesRes.error || awardsRes.error || highlightsRes.error;
    if (round1Err) throw round1Err;

    // camp standings — aggregate points across all leagues per team, INCLUDING non-game points
    const standingsRows = standingsRes.data || [];
    const totalsMap = {};
    standingsRows.forEach((row) => {
      const name = String(row.team_name || "").trim().toLowerCase();
      if (!name) return;
      totalsMap[name] = (totalsMap[name] || 0) + Number(row.league_points || 0);
    });

    // Add non-game points on top, same as the public Standings "Overall" tab
    (ngStandingsRes.data || []).forEach((row) => {
      const name = String(row.team_name || "").trim().toLowerCase();
      if (!name) return;
      totalsMap[name] = (totalsMap[name] || 0) + Number(row.points || 0);
    });

    const aggregated = Object.entries(totalsMap)
      .map(([team_name, league_points]) => ({ team_name, league_points }))
      .sort((a, b) => b.league_points - a.league_points);

    setCampStandings(aggregated);

    // ---- LEAGUE CHAMPIONS (per league winner for banquet) ----
    const champByLeague = {};
    for (const row of standingsRows) {
      const lg = String(row.league_id || "").toLowerCase();
      if (!lg) continue;
      const pts = Number(row.league_points || 0);
      if (!champByLeague[lg] || pts > champByLeague[lg].league_points) {
        champByLeague[lg] = { team_name: row.team_name, league_points: pts, wins: row.wins, losses: row.losses };
      }
    }
    setChampions(champByLeague);

    setLiveGames(liveRes.data || []);
    setFinalGames(finalsRes.data || []);

    setLeadersByLeague({
      seniors: seniorsLeaders,
      juniors: juniorsLeaders,
      sophomores: sophomoresLeaders,
    });

    // ---- PER GAME LEADERS -------------------------------------------------
    // For each sport + stat, who averages the most per game played. The
    // denominator is games the player was ROSTERED for in that sport, so a
    // kid with 10 goals across 5 games shows 2.0, not 10.0.
    const MIN_GAMES = 2; // raise this to require more games to qualify

    const avgTotals = avgTotalsRes.data || [];
    const avgGames = avgGamesRes.data || [];

    const sportByGame = {};
    for (const g of avgGames) sportByGame[g.id] = String(g.sport || "").toLowerCase();
    const gameIds = Object.keys(sportByGame);
    const avgIds = Array.from(new Set(avgTotals.map((t) => String(t.player_id))));

    // ---- Round 2: these two depend on round 1's results (the game ids /
    // player ids above), so they can't start until round 1 resolves — but
    // they don't depend on EACH OTHER, so they still run together. ----
    const [rosterRes, departedRes] = await Promise.all([
      gameIds.length
        ? supabase.from("game_roster").select("game_id, player_id").in("game_id", gameIds).limit(50000)
        : Promise.resolve({ data: [] }),
      avgIds.length
        ? supabase.from("players").select("id").in("id", avgIds).eq("departed", true)
        : Promise.resolve({ data: [] }),
    ]);

    if (rosterRes.error || departedRes.error) throw rosterRes.error || departedRes.error;

    // rosters -> games played per player per sport
    const played = {};
    for (const row of rosterRes.data || []) {
      const sp = sportByGame[row.game_id];
      if (!sp) continue;
      const pid = String(row.player_id);
      played[pid] = played[pid] || {};
      played[pid][sp] = (played[pid][sp] || 0) + 1;
    }

    // departed players never appear on the board
    const avgDeparted = new Set((departedRes.data || []).map((d) => String(d.id)));

    // best average per sport + stat
    const bestAvg = new Map();
    for (const t of avgTotals) {
      const pid = String(t.player_id);
      if (avgDeparted.has(pid)) continue;
      const value = Number(t.value || 0);
      if (value <= 0) continue;
      const sp = String(t.sport || "").toLowerCase();
      const games = played[pid]?.[sp] || 0;
      if (games < MIN_GAMES) continue;
      const avg = value / games;
      const lg = String(t.league_id || "").toLowerCase();
      const key = `${lg}:${sp}:${String(t.stat_key || "").toLowerCase()}`;
      const prev = bestAvg.get(key);
      if (!prev || avg > prev.avg) {
        bestAvg.set(key, {
          key,
          avg,
          games,
          total: value,
          sport: t.sport,
          stat_key: t.stat_key,
          player_name: t.player_name,
          team_name: t.team_name,
          league_id: t.league_id,
        });
      }
    }

    const byLeague = { seniors: [], juniors: [], sophomores: [] };
    for (const row of bestAvg.values()) {
      const lg = String(row.league_id || "").toLowerCase();
      if (byLeague[lg]) byLeague[lg].push(row);
    }
    for (const lg of Object.keys(byLeague)) {
      byLeague[lg].sort((a, b) => {
        const s = String(a.sport).localeCompare(String(b.sport));
        return s !== 0 ? s : String(a.stat_key).localeCompare(String(b.stat_key));
      });
    }
    setAvgLeaders(byLeague);

    // ---- AWARDS (top 3 per award) ----
    setAwards(awardsRes.data || []);

    setSpotlight(spotlightScored);

    setHighlights(highlightsRes.data || []);
    } catch (e) {
      console.error("display loadAll failed, keeping last good state:", e);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const t = setInterval(() => {
      loadAll();
    }, 15000);

    return () => clearInterval(t);
  }, [autoRefresh, session]);

 useEffect(() => {
    if (!autoRotate) return;

    // Pure linear rotation. Each league's stat leaders is now its own
    // hardcoded scene (leaders_seniors, leaders_juniors, leaders_sophomores),
    // so no shared "league" variable needs to be mutated during rotation —
    // each scene is self-contained and always shows the right league.
    const t = setInterval(() => {
      setAvgPage((p) => p + 1);
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
  function renderChampions() {
    const LEAGUES = [
      { key: "seniors", label: "Senior League" },
      { key: "juniors", label: "Junior League" },
      { key: "sophomores", label: "Sophomore League" },
    ];
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-[32px] p-10"
           style={{
             border: "1px solid rgba(245,196,81,0.35)",
             background: "linear-gradient(160deg, #0b1f3b 0%, #08172c 100%)",
             boxShadow: "inset 0 0 120px rgba(245,196,81,0.08)",
           }}>
        <div className="mb-8 text-center">
          <div className="text-sm font-black uppercase tracking-[0.5em]" style={{ color: "#f5c451" }}>
            2026 Season
          </div>
          <div className="mt-2 text-7xl font-black text-white" style={{ fontFamily: "Georgia, serif" }}>
            League Champions
          </div>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-8">
          {LEAGUES.map(({ key, label }) => {
            const champ = champions[key];
            return (
              <div key={key} className="flex flex-col items-center justify-center rounded-[28px] p-8 text-center"
                   style={{
                     border: "1px solid rgba(245,196,81,0.30)",
                     background: "radial-gradient(120% 90% at 50% 0%, rgba(245,196,81,0.12), transparent 65%)",
                   }}>
                <div className="text-8xl" style={{ filter: "drop-shadow(0 6px 20px rgba(245,196,81,0.5))" }}>🏆</div>
                <div className="mt-4 text-xl font-black uppercase tracking-[0.3em]" style={{ color: "#f5c451" }}>
                  {label}
                </div>
                <div className="mt-3 text-5xl font-black text-white" style={{ fontFamily: "Georgia, serif" }}>
                  {champ ? champ.team_name : "—"}
                </div>
                {champ ? (
                  <div className="mt-4 rounded-full px-6 py-2 text-lg font-black"
                       style={{ background: "linear-gradient(180deg,#ffe9a8,#f5c451)", color: "#3a2a05" }}>
                    {champ.wins}-{champ.losses} · {champ.league_points} pts
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderAwards() {
    // Group top-3 by award, rotate which award is spotlighted using avgPage.
    const byAward = {};
    for (const r of awards) (byAward[r.o_award] = byAward[r.o_award] || []).push(r);
    for (const k of Object.keys(byAward)) byAward[k].sort((a, b) => a.o_rank - b.o_rank);
    const order = ["mvp","most_wins","iron_man","sharpshooter","buckets","playmaker","slugger"]
      .filter((k) => byAward[k] && byAward[k].length);

    if (!order.length) {
      return (
        <div className="flex h-full items-center justify-center text-2xl font-black text-white/40">
          Awards appear once games are played.
        </div>
      );
    }

    // spotlight one award per rotation tick
    const key = order[avgPage % order.length];
    const podium = byAward[key];
    const first = podium.find((p) => p.o_rank === 1);
    const rest = podium.filter((p) => p.o_rank > 1);
    const label = first?.o_award_label || key;

    return (
      <div className="flex h-full flex-col items-center justify-center overflow-hidden rounded-[32px] border border-[#f5c451]/30 bg-gradient-to-br from-slate-950 to-slate-900 p-10"
           style={{ boxShadow: "0 0 80px rgba(245,196,81,0.10) inset" }}>
        <div className="text-sm font-black uppercase tracking-[0.4em] text-[#f5c451]">Crest Awards</div>
        <div className="mt-2 text-6xl font-black text-white">{label}</div>

        {/* Gold */}
        {first ? (
          <div className="mt-8 flex flex-col items-center">
            <div className="text-8xl" style={{ filter: "drop-shadow(0 6px 20px rgba(245,196,81,0.55))" }}>🥇</div>
            <div className="mt-3 text-7xl font-black text-white">{first.o_player_name}</div>
            <div className="mt-2 text-xl font-black uppercase tracking-widest text-white/50">
              {first.o_team_name}
            </div>
            <div className="mt-4 rounded-full px-8 py-3 text-2xl font-black"
                 style={{ background: "linear-gradient(180deg,#ffe9a8,#f5c451)", color: "#3a2a05" }}>
              {first.o_display}
            </div>
          </div>
        ) : null}

        {/* Silver + bronze */}
        {rest.length ? (
          <div className="mt-8 grid grid-cols-2 gap-6">
            {rest.map((p) => (
              <div key={p.o_player_id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4">
                <div className="text-4xl">{p.o_rank === 2 ? "🥈" : "🥉"}</div>
                <div>
                  <div className="text-3xl font-black text-white">{p.o_player_name}</div>
                  <div className="text-sm font-bold uppercase tracking-widest text-white/40">
                    {p.o_team_name} · {p.o_display}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderAverages() {
    const LEAGUES = ["seniors", "juniors", "sophomores"];
    const PER_LEAGUE = 3; // cards per league column. Fits one screen, no scrolling.

    const total = LEAGUES.reduce((n, lg) => n + (avgLeaders[lg]?.length || 0), 0);
    if (!total) {
      return (
        <div className="flex h-full items-center justify-center text-2xl font-black text-white/40">
          Not enough games played yet.
        </div>
      );
    }

    // Rotate through each league's categories so everything gets airtime
    // over the course of the day without anyone having to scroll.
    function pageFor(lg) {
      const rows = avgLeaders[lg] || [];
      if (rows.length <= PER_LEAGUE) return rows;
      const pages = Math.ceil(rows.length / PER_LEAGUE);
      const start = (avgPage % pages) * PER_LEAGUE;
      const slice = rows.slice(start, start + PER_LEAGUE);
      // wrap around so the last page is never half empty
      return slice.length < PER_LEAGUE
        ? slice.concat(rows.slice(0, PER_LEAGUE - slice.length))
        : slice;
    }

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-950 to-slate-900 p-8 shadow-2xl">
        <div className="mb-6 flex shrink-0 items-center justify-between">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.3em] text-blue-500">By League</div>
            <div className="text-5xl font-black text-white">Per Game Leaders</div>
          </div>
          <div className="rounded-2xl border border-blue-500/40 bg-blue-500/15 px-6 py-4">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-300">BEST AVERAGE</div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-3 gap-6 overflow-hidden">
          {LEAGUES.map((lg) => (
            <div key={lg} className="flex min-h-0 flex-col gap-4">
              <div className="shrink-0 text-center text-lg font-black uppercase tracking-[0.3em] text-white/40">
                {fmtLeague(lg)}
              </div>

              {pageFor(lg).map((r) => (
                <div
                  key={r.key}
                  className="flex-1 rounded-[24px] border border-white/10 bg-white/[0.04] px-6 py-4"
                >
                  <div className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-400">
                    {fmtSport(r.sport)} &middot; {String(r.stat_key).toUpperCase()}
                  </div>

                  <div className="mt-1 flex items-end gap-2">
                    <div className="text-5xl font-black tabular-nums leading-none text-white">
                      {r.avg.toFixed(1)}
                    </div>
                    <div className="pb-1 text-[11px] font-black uppercase tracking-widest text-white/40">
                      per game
                    </div>
                  </div>

                  <div className="mt-2 truncate text-2xl font-black text-white">
                    {r.player_name}
                  </div>
                  <div className="truncate text-sm font-bold text-white/50">
                    {r.team_name} &middot; {r.total} in {r.games} game{r.games === 1 ? "" : "s"}
                  </div>
                </div>
              ))}

              {!(avgLeaders[lg] || []).length ? (
                <div className="flex flex-1 items-center justify-center rounded-[24px] border border-white/5 text-sm font-black uppercase tracking-widest text-white/20">
                  No qualifiers yet
                </div>
              ) : null}
            </div>
          ))}
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
              {fmtLeague(g.league_key)} • {fmtSport(g.sport)}
            </div>

            <div className="mt-5 text-3xl font-black text-white">
              {g.team_a1}{g.team_a2 ? ` + ${g.team_a2}` : ""}
            </div>

            <div className="my-5 text-center text-6xl font-black text-blue-400">
              {g.score_a} - {g.score_b}
            </div>

            <div className="text-right text-3xl font-black text-white">
              {g.team_b1}{g.team_b2 ? ` + ${g.team_b2}` : ""}
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

  /* ===== MAIN RETURN ===== */
    if (isCW) {
      return <ColorWarBoard session={session} blueName={blueName} whiteName={whiteName} blueLogo={blueLogo} whiteLogo={whiteLogo} />;
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
          <div className="flex items-center gap-2 rounded-xl border px-4 py-2" style={{ borderColor: "rgba(245,196,81,0.4)", background: "rgba(0,0,0,0.4)", boxShadow: "0 0 18px rgba(245,196,81,0.3)" }}>
            <span
              className="text-2xl font-black italic tracking-tighter"
              style={{
                color: "#f5c451",
                textShadow: "0 0 6px #f5c451, 0 0 14px #f5c451, 0 0 22px rgba(245,196,81,0.6)",
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
            className="h-10 rounded-xl border px-4 text-sm font-black text-white hover:brightness-110" style={{ borderColor: "rgba(245,196,81,0.4)", background: "rgba(245,196,81,0.15)" }}
          >
            Fullscreen
          </button>

          <div className="hidden h-10 items-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black tabular-nums text-white/80 lg:flex">
            <LiveClock />
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
                  ? "text-black shadow-lg"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              )}
              style={scene === s ? { background: "linear-gradient(180deg,#ffe9a8,#f5c451)" } : {}}
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

          {scene === "averages" && renderAverages()}
          {scene === "champions" && renderChampions()}
          {scene === "awards" && renderAwards()}
          {scene === "finals" && renderFinals()}
          {scene === "spotlight" && renderSpotlight()}
          {scene === "leaders_seniors" && renderLeaders("seniors")}
          {scene === "leaders_juniors" && renderLeaders("juniors")}
          {scene === "leaders_sophomores" && renderLeaders("sophomores")}
          {scene === "highlights" && <HighlightsScene highlights={highlights} />}
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
    <footer className="absolute bottom-0 left-0 right-0 z-20 flex h-[52px] overflow-hidden border-t-2" style={{ borderColor: "rgba(245,196,81,0.5)", background: "#08172c", boxShadow: "0 -4px 20px rgba(245,196,81,0.2)" }}>
      <div className="flex shrink-0 items-center bg-black px-5">
        <div
          className="text-sm font-black uppercase tracking-[0.25em]"
          style={{ color: "#f5c451", textShadow: "0 0 8px #f5c451" }}
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