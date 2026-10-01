"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import { useRealtimeTable } from "@/lib/useRealtimeTable";
import FlashNumber from "@/components/FlashNumber";
import ColorWarBoard from "./ColorWarBoard";

import { Meter } from "@/components/ui";
// Display-board scene set. Which list is active is now controlled from
// Admin → Display Board (app_settings.display_mode via useAppMode's
// isBanquet), not a hardcoded source flag — this used to be
// `const BANQUET = true;`, permanently pinning the board to banquet-only
// scenes (no live scores, no camp standings) with no way to flip it back
// without a code change + redeploy.
const SCENES_BANQUET = ["champions", "recap", "awards", "spotlight", "highlights"];
const SCENES_NORMAL = [
  "camp",
  "live",
  "spotlight",
  "averages",
  "awards",
  "finals",
  "leaders_seniors",
  "leaders_juniors",
  "leaders_sophomores",
  "highlights",
];

const SCENE_LABELS = {
  champions: "League Champions",
  recap: "Season Recap",
  camp: "Camp Standings",
  live: "Live Now",
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

// One atomic status message for the first live game whose score actually
// changed since the last poll/realtime tick — never a bare number, and
// never one message per changed game (a wall of simultaneous live-region
// announcements is worse than one, per accessibility guidance on status
// messages).
function announceScoreChange(prevGames, nextGames) {
  const prevMap = new Map((prevGames || []).map((g) => [g.id, g]));
  for (const g of nextGames || []) {
    const prev = prevMap.get(g.id);
    if (prev && (Number(prev.score_a) !== Number(g.score_a) || Number(prev.score_b) !== Number(g.score_b))) {
      const left = g.team_a1 || "Team A";
      const right = g.team_b1 || "Team B";
      return `Score update: ${left} ${Number(g.score_a || 0)}, ${right} ${Number(g.score_b || 0)}`;
    }
  }
  return null;
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
    <div className="flex h-full items-center justify-center">
      <div className="bc-display text-5xl text-[var(--ink-3)]">No highlights yet.</div>
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
      <div className="board-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--rule)] px-8 py-4">
          <div>
            <div className="text-lg font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">Featured highlight</div>
            <div className="bc-display mt-1 text-5xl leading-none">
              {h.title || "Camp highlight"}
            </div>
          </div>
          <div className="bc-num text-4xl text-[var(--ink-2)]">
            {safeIndex + 1} / {highlights.length}
          </div>
        </div>

        <div className="h-[calc(100%-104px)]" style={{ background: "#050e1f" }}>
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
              alt={h.title || "Camp highlight photo"}
              loading="lazy"
              className="h-full w-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function DisplayPage() {
  const { isCW, session, blueName, whiteName, blueLogo, whiteLogo, isBanquet, loading: modeLoading } = useAppMode();
  const [scene, setScene] = useState("camp");

  const [campStandings, setCampStandings] = useState([]);
  const [champions, setChampions] = useState({});
  const [liveGames, setLiveGames] = useState([]);
  const [finalGames, setFinalGames] = useState([]);
  const [leadersByLeague, setLeadersByLeague] = useState({ seniors: [], juniors: [], sophomores: [] });
  const [highlights, setHighlights] = useState([]);
  const [spotlight, setSpotlight] = useState([]);
  const [recap, setRecap] = useState({ gamesPlayed: 0, totalPoints: 0, statEvents: 0, biggest: null });

  // Which scene set is currently active — recomputed whenever admin flips
  // Season/Banquet mode, not fixed at module load.
  const SCENES = isBanquet ? SCENES_BANQUET : SCENES_NORMAL;

  // Screen-reader announcement of the most recent live score change. Visual
  // score updates already propagate instantly via Realtime; without this, a
  // screen-reader user watching this public board gets no signal at all
  // that anything changed (WCAG 4.1.3 Status Messages).
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const prevLiveGamesRef = useRef([]);

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
        .select("id, sport, league_key, team_a1, team_a2, team_b1, team_b2, score_a, score_b")
        .eq("status", "active")
        .eq("season", "league")
        .eq("session", session)
        .is("played_on", null)
        .order("updated_at", { ascending: false }),
      supabase
        .from("live_games")
        .select("id, sport, league_key, team_a1, team_a2, team_b1, team_b2, score_a, score_b")
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
      // Also backs the Season Recap scene (games played, total points,
      // biggest margin of victory) — reuses this query instead of firing a
      // separate one for the same "final games this session" rows.
      supabase
        .from("live_games")
        .select("id, sport, score_a, score_b, team_a1, team_b1")
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

    const nextLiveGames = liveRes.data || [];
    const announcement = announceScoreChange(prevLiveGamesRef.current, nextLiveGames);
    if (announcement) setLiveAnnouncement(announcement);
    prevLiveGamesRef.current = nextLiveGames;
    setLiveGames(nextLiveGames);
    setFinalGames(finalsRes.data || []);

    setLeadersByLeague({
      seniors: seniorsLeaders,
      juniors: juniorsLeaders,
      sophomores: sophomoresLeaders,
    });

    // ---- PER GAME LEADERS -------------------------------------------------
    // For each sport + stat, who averages the most per game played. The
    // denominator is games the player actually PLAYED in that sport, so a
    // kid with 10 goals across 5 games shows 2.0, not 10.0.
    const MIN_GAMES = 2; // raise this to require more games to qualify

    const avgTotals = avgTotalsRes.data || [];
    const avgGames = avgGamesRes.data || [];

    const sportByGame = {};
    for (const g of avgGames) sportByGame[g.id] = String(g.sport || "").toLowerCase();
    const gameIds = Object.keys(sportByGame);
    const avgIds = Array.from(new Set(avgTotals.map((t) => String(t.player_id))));

    // ---- Round 2: these three depend on round 1's results (the game ids /
    // player ids above), so they can't start until round 1 resolves — but
    // they don't depend on EACH OTHER, so they still run together. ----
    const [rosterRes, departedRes, statEventsRes] = await Promise.all([
      gameIds.length
        ? supabase.from("game_roster").select("game_id, player_id").eq("is_playing", true).in("game_id", gameIds).limit(50000)
        : Promise.resolve({ data: [] }),
      avgIds.length
        ? supabase.from("players").select("id").in("id", avgIds).eq("departed", true)
        : Promise.resolve({ data: [] }),
      // Season Recap's "moments logged" tile — every individual stat tap
      // recorded across this session's finalized games.
      gameIds.length
        ? supabase.from("live_events").select("id", { count: "exact", head: true }).eq("event_type", "stat").in("game_id", gameIds)
        : Promise.resolve({ count: 0 }),
    ]);

    if (rosterRes.error || departedRes.error || statEventsRes.error) throw rosterRes.error || departedRes.error || statEventsRes.error;

    // ---- SEASON RECAP (banquet scene) ----
    let totalPoints = 0;
    let biggest = null;
    for (const g of avgGames) {
      const a = Number(g.score_a || 0), b = Number(g.score_b || 0);
      totalPoints += a + b;
      const margin = Math.abs(a - b);
      if (a + b > 0 && (!biggest || margin > biggest.margin)) {
        biggest = { margin, sport: g.sport, team_a1: g.team_a1, team_b1: g.team_b1, score_a: a, score_b: b };
      }
    }
    setRecap({
      gamesPlayed: avgGames.length,
      totalPoints,
      statEvents: statEventsRes.count || 0,
      biggest,
    });

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

  // Instant updates: a score/stat tap anywhere pushes a Postgres change
  // event, so the board refreshes in well under a second instead of
  // waiting for the next poll.
  useRealtimeTable(["live_games", "live_events"], loadAll, { enabled: autoRefresh });

  useEffect(() => {
    if (!autoRefresh) return;

    // Safety-net poll for a silently-dropped realtime socket -- slow since
    // the realtime subscription above is doing the real work now.
    const t = setInterval(() => {
      loadAll();
    }, 60000);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRotate, rotateSeconds, isBanquet]);

  // If admin flips Season/Banquet mode while the board is open, jump
  // straight to that scene set's first scene instead of sitting on
  // whatever scene name happened to be active (which might not exist in
  // the other set at all, and would otherwise render blank until the next
  // rotation tick).
  useEffect(() => {
    setScene(SCENES[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBanquet]);

 const tickerItems = useMemo(() => {
  const live = liveGames.slice(0, 4).map((g) => {
    const left = g.team_a1 || "Team A";
    const right = g.team_b1 || "Team B";
    const leagueName = fmtLeague(g.league_id || g.league_key);
    return `LIVE: ${leagueName} ${fmtSport(g.sport)} — ${left} ${Number(g.score_a || 0)}-${Number(g.score_b || 0)} ${right}`;
  });

  const finals = finalGames.slice(0, 6).map((g) => {
    const a = Number(g.score_a || 0);
    const b = Number(g.score_b || 0);
    const sideA = [g.team_a1, g.team_a2].filter(Boolean).join(" + ");
    const sideB = [g.team_b1, g.team_b2].filter(Boolean).join(" + ");
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

  /* ===== SCENES ===== */
  // Night palette. Gold (--banquet) is used only by the banquet scenes:
  // champions, awards, recap.

  function TrophyIcon({ size = 96 }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
        <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11" />
        <path d="M12 14v4M8.5 20h7M9.5 18h5" />
      </svg>
    );
  }

  function SceneEmpty({ children }) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="bc-display text-center text-5xl text-[var(--ink-3)]" style={{ maxWidth: 900 }}>{children}</div>
      </div>
    );
  }

  function renderChampions() {
    const LEAGUES = [
      { key: "seniors", label: "Senior League" },
      { key: "juniors", label: "Junior League" },
      { key: "sophomores", label: "Sophomore League" },
    ];
    return (
      <div className="board-card board-banquet flex h-full flex-col overflow-hidden p-10">
        <div className="mb-8 flex items-end justify-between border-b-2 pb-4" style={{ borderColor: "var(--banquet)" }}>
          <div className="bc-display text-7xl leading-none xl:text-8xl">League champions</div>
          <div className="bc-display text-4xl leading-none" style={{ color: "var(--banquet)" }}>2026 season</div>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-8">
          {LEAGUES.map(({ key, label }) => {
            const champ = champions[key];
            return (
              <div key={key} className="flex flex-col items-center justify-center rounded-md p-8 text-center" style={{ border: "2px solid var(--banquet)" }}>
                <div style={{ color: "var(--banquet)" }}><TrophyIcon size={112} /></div>
                <div className="mt-4 text-2xl font-bold uppercase tracking-[0.12em]" style={{ color: "var(--banquet)" }}>
                  {label}
                </div>
                <div className="bc-display mt-3 text-balance text-7xl leading-[0.95]">
                  {champ ? champ.team_name : "—"}
                </div>
                {champ ? (
                  <div className="bc-num mt-5 text-4xl" style={{ color: "var(--banquet)" }}>
                    {champ.wins}–{champ.losses} · {champ.league_points} pts
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
      return <SceneEmpty>Awards appear once games are played.</SceneEmpty>;
    }

    // spotlight one award per rotation tick
    const key = order[avgPage % order.length];
    const podium = byAward[key];
    const first = podium.find((p) => p.o_rank === 1);
    const rest = podium.filter((p) => p.o_rank > 1);
    const label = first?.o_award_label || key;

    return (
      <div className="board-card board-banquet flex h-full flex-col justify-center overflow-hidden p-10">
        <div className="text-2xl font-bold uppercase tracking-[0.12em]" style={{ color: "var(--banquet)" }}>Crest Awards</div>
        <div className="bc-display mt-1 text-8xl leading-none">{label}</div>

        {first ? (
          <div className="mt-8 grid grid-cols-[auto_1fr_auto] items-center gap-8 rounded-md p-8" style={{ border: "2px solid var(--banquet)" }}>
            <div className="bc-num text-[11rem] leading-[0.8]" style={{ color: "var(--banquet)" }} aria-label="First place">1</div>
            <div className="min-w-0">
              <div className="bc-display text-balance text-8xl leading-[0.95]">{first.o_player_name}</div>
              <div className="mt-2 text-2xl font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">
                {first.o_team_name}
              </div>
            </div>
            <div className="bc-num text-7xl" style={{ color: "var(--banquet)" }}>{first.o_display}</div>
          </div>
        ) : null}

        {rest.length ? (
          <div className="mt-6 grid grid-cols-2 gap-6">
            {rest.map((p) => (
              <div key={p.o_player_id} className="flex items-center gap-5 border-t-2 border-[var(--rule)] px-2 py-4">
                <div className="bc-num text-6xl text-[var(--ink-2)]" aria-label={p.o_rank === 2 ? "Second place" : "Third place"}>{p.o_rank}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-4xl font-bold">{p.o_player_name}</div>
                  <div className="text-lg font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">{p.o_team_name}</div>
                </div>
                <div className="bc-num text-4xl">{p.o_display}</div>
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
      return <SceneEmpty>Not enough games played yet.</SceneEmpty>;
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
      <div className="board-card flex h-full flex-col overflow-hidden p-8">
        <div className="mb-6 flex shrink-0 items-end justify-between border-b-2 border-[var(--rule-strong)] pb-3">
          <div className="bc-display text-6xl leading-none">Per-game leaders</div>
          <div className="text-xl font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">Best average by league</div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-3 gap-8 overflow-hidden">
          {LEAGUES.map((lg) => (
            <div key={lg} className="flex min-h-0 flex-col gap-4">
              <div className="bc-display shrink-0 text-4xl leading-none">{fmtLeague(lg)}</div>

              {pageFor(lg).map((r) => (
                <div key={r.key} className="flex-1 border-t-2 border-[var(--rule)] pt-3">
                  <div className="text-lg font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    {fmtSport(r.sport)} &middot; {String(r.stat_key).toUpperCase()}
                  </div>

                  <div className="mt-1 flex items-end gap-3">
                    <div className="bc-num text-8xl leading-[0.85]">{r.avg.toFixed(1)}</div>
                    <div className="pb-1 text-base font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">per game</div>
                  </div>

                  <div className="mt-2 truncate text-3xl font-bold">{r.player_name}</div>
                  <div className="truncate text-lg text-[var(--ink-2)]">
                    {r.team_name} &middot; {r.total} in {r.games} game{r.games === 1 ? "" : "s"}
                  </div>
                </div>
              ))}

              {!(avgLeaders[lg] || []).length ? (
                <div className="flex flex-1 items-center justify-center rounded-md border-2 border-dashed border-[var(--rule)] text-xl font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
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
      return <SceneEmpty>No performances tracked yet. Check back after tonight&apos;s games.</SceneEmpty>;
    }

    return (
      <div className="flex h-full flex-col">
        <div className="mb-6 flex items-end justify-between border-b-2 border-[var(--rule-strong)] pb-3">
          <div className="bc-display text-7xl leading-none">Camper spotlight</div>
          <div className="text-xl font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">Top performances</div>
        </div>

        <div className={`grid flex-1 gap-6 ${spotlight.length === 3 ? "grid-cols-3" : spotlight.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {spotlight.map((p, i) => (
            <div key={i} className="board-card flex flex-col justify-between overflow-hidden p-10">
              <div className="flex items-start justify-between">
                <div className="text-lg font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">
                  {String(p.sport)}
                </div>
                <div className="bc-num text-8xl leading-[0.8]" style={{ color: i === 0 ? "var(--ink)" : "var(--ink-3)" }}>{i + 1}</div>
              </div>

              <div className="mt-6 flex-1">
                <div className="bc-display text-balance text-8xl leading-[0.92]">{p.player_name}</div>
                <div className="mt-3 text-2xl font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">{p.team_name}</div>
              </div>

              <div className="mt-8 border-t-2 border-[var(--rule)] pt-4">
                <div className="bc-num text-6xl">{statLine(p.sport, p.stats)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderRecap() {
    const tiles = [
      { label: "Games played", value: recap.gamesPlayed },
      { label: "Points scored", value: recap.totalPoints },
      { label: "Stats logged", value: recap.statEvents },
    ];
    return (
      <div className="board-card board-banquet flex h-full flex-col overflow-hidden p-10">
        <div className="mb-8 flex items-end justify-between border-b-2 pb-4" style={{ borderColor: "var(--banquet)" }}>
          <div className="bc-display text-8xl leading-none">Season recap</div>
          <div className="bc-display text-4xl leading-none" style={{ color: "var(--banquet)" }}>The summer, by the numbers</div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col justify-center p-6" style={{ borderTop: "2px solid var(--banquet)" }}>
              <div className="bc-num text-[9rem] leading-[0.85] xl:text-[11rem]">
                <FlashNumber value={t.value} />
              </div>
              <div className="mt-3 text-2xl font-bold uppercase tracking-[0.1em]" style={{ color: "var(--banquet)" }}>
                {t.label}
              </div>
            </div>
          ))}
        </div>

        {recap.biggest ? (
          <div className="mt-8 flex flex-1 flex-col justify-center p-8" style={{ border: "2px solid var(--banquet)" }}>
            <div className="text-2xl font-bold uppercase tracking-[0.12em]" style={{ color: "var(--banquet)" }}>
              Biggest blowout
            </div>
            <div className="bc-display mt-3 text-7xl leading-none">
              {recap.biggest.team_a1} {recap.biggest.score_a}–{recap.biggest.score_b} {recap.biggest.team_b1}
            </div>
            <div className="mt-2 text-xl font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">
              {fmtSport(recap.biggest.sport)} · won by {recap.biggest.margin}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderLive() {
    if (!liveGames.length) {
      return <SceneEmpty>No games live right now. Check back soon.</SceneEmpty>;
    }
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {liveGames.map((g) => (
          <div key={g.id} className="board-card p-8">
            <div className="flex items-center justify-between">
              <span className="bc-live-badge" style={{ fontSize: 16, minHeight: 36, padding: "0 14px" }}>
                <span className="bc-live-dot" aria-hidden="true" />Live
              </span>
              <div className="text-xl font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                {fmtLeague(g.league_key)} · {fmtSport(g.sport)}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
              <div className="bc-display text-balance text-5xl leading-none xl:text-6xl">{g.team_a1}{g.team_a2 ? ` + ${g.team_a2}` : ""}</div>
              <div className="bc-num text-8xl leading-none xl:text-9xl">
                <FlashNumber value={Number(g.score_a || 0)} />–<FlashNumber value={Number(g.score_b || 0)} />
              </div>
              <div className="bc-display text-balance text-right text-5xl leading-none xl:text-6xl">{g.team_b1}{g.team_b2 ? ` + ${g.team_b2}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderFinals() {
    if (!finalGames.length) {
      return <SceneEmpty>No finals yet today.</SceneEmpty>;
    }
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {finalGames.map((g) => {
          const a = Number(g.score_a || 0);
          const b = Number(g.score_b || 0);
          return (
            <div key={g.id} className="board-card p-8">
              <div className="flex items-center justify-between">
                <span className="bc-chip" style={{ fontSize: 16, minHeight: 34, background: "var(--ink)", color: "var(--on-ink)", borderColor: "var(--ink)" }}>Final</span>
                <div className="text-lg font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                  {fmtLeague(g.league_key)} · {fmtSport(g.sport)}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--rule)] pb-3">
                <div className={`bc-display text-balance text-5xl leading-none ${a >= b ? "" : "text-[var(--ink-2)]"}`}>{g.team_a1}{g.team_a2 ? ` + ${g.team_a2}` : ""}</div>
                <div className={`bc-num text-8xl leading-[0.85] ${a >= b ? "" : "text-[var(--ink-3)]"}`}>{a}</div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-4">
                <div className={`bc-display text-balance text-5xl leading-none ${b >= a ? "" : "text-[var(--ink-2)]"}`}>{g.team_b1}{g.team_b2 ? ` + ${g.team_b2}` : ""}</div>
                <div className={`bc-num text-8xl leading-[0.85] ${b >= a ? "" : "text-[var(--ink-3)]"}`}>{b}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderLeaders(leagueKey) {
    const leaders = leadersByLeague[leagueKey] || [];
    if (!leaders.length) {
      return <SceneEmpty>No stat leaders yet for {fmtLeague(leagueKey)}.</SceneEmpty>;
    }
    return (
      <div className="flex h-full flex-col gap-6">
        <div className="flex items-end justify-between border-b-2 border-[var(--rule-strong)] pb-3">
          <div className="bc-display text-7xl leading-none">{fmtLeague(leagueKey)} stat leaders</div>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {leaders.slice(0, 9).map((p) => (
          <div
            key={`${String(p.sport || "").toLowerCase()}-${String(p.stat_key || "").toLowerCase()}`}
            className="board-card p-8"
          >
            <div className="flex items-center justify-between text-lg font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">
              <span>{fmtSport(p.sport)}</span>
              <span>{String(p.stat_key || "").toUpperCase()}</span>
            </div>

            <div className="mt-3 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="bc-display text-balance text-5xl leading-[0.95]">{p.player_name}</div>
                <div className="mt-1 text-xl text-[var(--ink-2)]">{p.team_name}</div>
              </div>
              <div className="bc-num text-9xl leading-[0.8]">{p.value}</div>
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
    <div
      ref={wrapRef}
      data-theme="night"
      className="relative min-h-screen overflow-hidden"
      style={{ color: "var(--ink)", background: "radial-gradient(60% 50% at 85% 0%, rgba(255,128,60,0.12), transparent 70%), linear-gradient(180deg, rgba(5,13,28,0.8), rgba(5,13,28,0.94) 55%, #050d1c), url(/camp-bg.jpg) center 35% / cover no-repeat, #050d1c" }}
    >
      <h1 className="sr-only">Crest League Live — {isBanquet ? "Banquet" : "Season"} display board</h1>
      {/* Announces the latest live score change for screen-reader viewers —
          the visual board updates instantly via Realtime, but nothing said
          so before this. */}
      <div aria-live="polite" className="sr-only">{liveAnnouncement}</div>

      {/* Header: network mark, current scene, clock. Staff controls only
          appear when the mouse moves over the header or a control has focus,
          so the room never sees buttons. */}
      <header className="group relative z-10 flex h-[72px] items-center justify-between border-b-2 border-[var(--rule-strong)] px-6">
        <div className="flex items-center gap-5">
          <img src="/crest-logo.png" alt="" width="56" height="56" className="h-14 w-14" style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.6))" }} />
          <div className="grid h-11 place-items-center px-4 bc-num text-3xl leading-none" style={{ background: "var(--ink)", color: "var(--on-ink)", clipPath: "polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)" }}>
            CBSN
          </div>
          <div className="hidden text-lg font-bold uppercase tracking-[0.1em] text-[var(--ink-2)] md:block">
            Camp Bauercrest Sports Network
          </div>

          {isBanquet ? (
            <div className="rounded-[4px] border-[1.5px] px-3 py-1 text-sm font-bold uppercase tracking-[0.1em]" style={{ borderColor: "var(--banquet)", color: "var(--banquet)" }}>
              Banquet
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
            <button onClick={loadAll} className="btn btn-secondary btn-sm">Refresh</button>
            <button onClick={() => setAutoRefresh((x) => !x)} className="btn btn-secondary btn-sm">Auto {autoRefresh ? "on" : "off"}</button>
            <button onClick={() => setAutoRotate((x) => !x)} className="btn btn-secondary btn-sm">Rotate {autoRotate ? "on" : "off"}</button>
            <select
              value={rotateSeconds}
              aria-label="Seconds per scene"
              onChange={(e) => setRotateSeconds(Number(e.target.value))}
              style={{ minHeight: 44 }}
            >
              <option value={12}>12s</option>
              <option value={18}>18s</option>
              <option value={25}>25s</option>
              <option value={35}>35s</option>
            </select>
            <button onClick={goFullscreen} className="btn btn-sm">Fullscreen</button>
          </div>

          <div className="bc-num hidden text-5xl leading-none lg:block">
            <LiveClock />
          </div>
        </div>
      </header>

      {/* Scene strip: doubles as the "what's on" indicator */}
      <nav aria-label="Board scenes" className="relative z-10 flex h-[56px] items-center gap-1 overflow-x-auto border-b border-[var(--rule)] px-6">
        {SCENES.map((s) => (
          <button
            key={s}
            onClick={() => setScene(s)}
            aria-current={scene === s ? "true" : undefined}
            className="h-10 shrink-0 rounded-[4px] px-3.5 text-[17px] font-bold uppercase tracking-[0.06em] transition-colors"
            style={scene === s
              ? { background: "var(--ink)", color: "var(--on-ink)" }
              : { color: "var(--ink-2)" }}
          >
            {SCENE_LABELS[s]}
          </button>
        ))}
      </nav>

      {/* Main board area */}
      <section className="relative z-10 h-[calc(100vh-72px-56px-56px)] p-6">
        <div key={scene} className="scene-in h-full overflow-hidden">
          {scene === "camp" && (
            <div className="board-card flex h-full flex-col p-8">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-2 border-[var(--rule-strong)] pb-3">
                <div className="bc-display text-5xl leading-none md:text-7xl">Camp standings</div>
                <div className="text-xl font-bold uppercase tracking-[0.1em] text-[var(--ink-2)]">All age groups</div>
              </div>

              <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-x-10 xl:grid-cols-2">
                {campStandings.map((t, i) => (
                  <div
                    key={`${t.league_id}-${t.team_name}-${i}`}
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--rule)] py-2 md:gap-6"
                  >
                    <div
                      className="bc-num grid h-14 w-14 place-items-center rounded-[4px] text-4xl leading-none md:h-20 md:w-20 md:text-6xl"
                      style={i === 0 ? { background: "var(--ink)", color: "var(--on-ink)" } : { color: "var(--ink-2)", border: "2px solid var(--rule)" }}
                    >
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="bc-display text-balance leading-[0.92]" style={{ fontSize: "clamp(26px, 4.2vw, 88px)", overflowWrap: "anywhere" }}>
                        {t.team_name}
                      </div>
                      <div className="mt-2">
                        <Meter value={Number(t.league_points || 0)} max={Math.max(1, ...campStandings.map((x) => Number(x.league_points || 0)))} lead={i === 0} index={i} />
                      </div>
                    </div>
                    <div className="bc-num leading-[0.85]" style={{ fontSize: "clamp(48px, 9vw, 190px)" }}>
                      <FlashNumber value={Number(t.league_points || 0)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scene === "averages" && renderAverages()}
          {scene === "champions" && renderChampions()}
          {scene === "recap" && renderRecap()}
          {scene === "live" && renderLive()}
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
    </div>
  );
}

/* ===== BOTTOM COMPONENTS ===== */
function Ticker({ items }) {
  const text = items && items.length ? items.join("     •     ") : "";
  if (!text) return null;
  return (
    <footer className="absolute bottom-0 left-0 right-0 z-20 flex h-[56px] overflow-hidden border-t-2 border-[var(--rule-strong)]" style={{ background: "var(--sheet)" }}>
      <div className="flex shrink-0 items-center px-5" style={{ background: "var(--ink)", color: "var(--on-ink)" }}>
        <div className="bc-display text-2xl">Ticker</div>
      </div>

      <div className="relative flex flex-1 items-center overflow-hidden">
        <div className="animate-[ticker_55s_linear_infinite] whitespace-nowrap px-8 text-2xl font-bold uppercase tracking-[0.04em]">
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
