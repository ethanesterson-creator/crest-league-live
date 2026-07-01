"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

function norm(s) { return String(s ?? "").trim().toLowerCase(); }

function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds ?? 0)));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function parseMMSS(input) {
  const t = String(input ?? "").trim();
  const m = t.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatMMSSFromDigits(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 5);
  if (!digits) return "00:00";
  const secPart = digits.slice(-2).padStart(2, "0");
  const minPart = digits.slice(0, -2) || "0";
  return `${String(Number(minPart)).padStart(2, "0")}:${String(Math.min(59, Number(secPart))).padStart(2, "0")}`;
}

function matchupLabel(a1, a2) {
  const x1 = norm(a1), x2 = norm(a2);
  if (x1 && x2 && x1 !== x2) return `${x1} + ${x2}`;
  return x1 || "—";
}

const isSoftball   = (s) => norm(s) === "softball";
const isBattingSport = (s) => ["softball", "kickball"].includes(norm(s));
const isSeriesSport  = (s) => ["volleyball", "newcomb"].includes(norm(s));
const isNoStatSport  = (rules) => !rules?.clock?.enabled && (rules?.stats?.length ?? 0) === 0;
const GOAL_AUTO_SCORE_SPORTS = ["euro", "soccer", "hockey", "speedball"];

const AT_BAT_OUTCOMES = [
  { key: "1b",  label: "1B",   statKey: "h",  color: "emerald", isHit: true  },
  { key: "2b",  label: "2B",   statKey: "h",  color: "emerald", isHit: true  },
  { key: "3b",  label: "3B",   statKey: "h",  color: "emerald", isHit: true  },
  { key: "hr",  label: "HR",   statKey: "hr", color: "amber",   isHit: true  },
  { key: "bb",  label: "BB",   statKey: null, color: "blue",    isHit: false },
  { key: "hbp", label: "HBP",  statKey: null, color: "blue",    isHit: false },
  { key: "k",   label: "K",    statKey: null, color: "red",     isHit: false, isOut: true },
  { key: "bk",  label: "ꓘ",    statKey: null, color: "red",     isHit: false, isOut: true },
  { key: "go",  label: "GO",   statKey: null, color: "red",     isHit: false, isOut: true },
  { key: "fo",  label: "FO",   statKey: null, color: "red",     isHit: false, isOut: true },
  { key: "sf",  label: "SF",   statKey: null, color: "red",     isHit: false, isOut: true },
  { key: "e",   label: "E",    statKey: null, color: "orange",  isHit: false },
  { key: "fc",  label: "FC",   statKey: null, color: "orange",  isHit: false },
];

function parseSeriesNotes(notes) {
  try {
    const p = JSON.parse(notes || "{}");
    return { format: Number(p.series_format) || 3, seriesA: Number(p.series_a) || 0, seriesB: Number(p.series_b) || 0 };
  } catch { return { format: 3, seriesA: 0, seriesB: 0 }; }
}

function stringifySeriesNotes(format, seriesA, seriesB) {
  return JSON.stringify({ series_format: format, series_a: seriesA, series_b: seriesB });
}

async function fetchCaptainIds({ leagueId, teamNames }) {
  if (!teamNames?.length) return new Set();
  const isCrestCup = norm(leagueId) === "crest_cup";
  const query = isCrestCup
    ? supabase.from("players").select("id, role, team_name").in("team_name", teamNames)
    : supabase.from("players").select("id, role, team_name").eq("league_id", leagueId).in("team_name", teamNames);
  const { data } = await query;
  const ids = new Set();
  for (const p of data || []) if (String(p.role || "").toLowerCase().includes("captain")) ids.add(String(p.id));
  return ids;
}

export default function LiveGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params?.id;
  const tapRef = useRef(false);

  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [game, setGame]         = useState(null);
  const [rosterA, setRosterA]   = useState([]);
  const [rosterB, setRosterB]   = useState([]);
  const [statTotals, setStatTotals] = useState({});
  const [captainIds, setCaptainIds] = useState(new Set());

  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [clockMode, setClockMode] = useState("");
  const [showBenchA, setShowBenchA] = useState(true);
  const [showBenchB, setShowBenchB] = useState(true);
  const [superCompact, setSuperCompact] = useState(true);
  const [showTopBar, setShowTopBar]     = useState(true);
  const [setTimeOpen, setSetTimeOpen]   = useState(false);
  const [timeInput, setTimeInput]       = useState("00:00");

  const [nowMs, setNowMs]   = useState(Date.now());
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const [inning, setInning]         = useState(1);
  const [inningHalf, setInningHalf] = useState("top");
  const [seriesFormat, setSeriesFormat] = useState(3);
  const [seriesA, setSeriesA] = useState(0);
  const [seriesB, setSeriesB] = useState(0);

  // ── Softball-specific state ──────────────────────────────────────────────
  // lineupOpen: controls the lineup setup popup
  // lineupDone:  true once counselor hits Done — popup never reopens
  // homeTeam:    "A" or "B" — the home team bats second
  // battingTeam: "A" or "B" — who is currently up
  // atBatResults: array of {playerId, playerName, outcome, half, inning}
  // currentBatterIdx: index into the playing list for the batting team
  const [lineupOpen, setLineupOpen]       = useState(false);
  const [lineupDone, setLineupDone]       = useState(false);
  const [homeTeam, setHomeTeam]           = useState("B");   // B = home by default (away bats first)
  const [battingTeam, setBattingTeam]     = useState("A");   // A = away bats first
  const [atBatResults, setAtBatResults]   = useState([]);    // local only, not persisted
  const [currentBatterIdx, setCurrentBatterIdx] = useState(0);
  const [outsThisHalf, setOutsThisHalf]   = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const rules = useMemo(() => getSportRules(game?.sport), [game?.sport]);

  useEffect(() => {
    if (!rules?.clock?.enabled) return;
    setClockMode(rules?.clock?.defaultMode || rules?.clock?.modes?.[0]?.id || "");
  }, [rules?.clock?.enabled, rules?.clock?.defaultMode, rules?.clock?.modes]);

  const activeClockMode = useMemo(() => {
    if (!rules?.clock?.enabled) return null;
    const modes = rules?.clock?.modes ?? [];
    return modes.find((m) => m.id === clockMode) ?? modes[0] ?? null;
  }, [rules, clockMode]);

  const derived = useMemo(() => {
    if (!game) return { remaining: 0, isRunning: false };
    const running   = !!game.timer_running;
    const anchorTs  = Number(game.timer_anchor_ts ?? 0);
    const atAnchor  = Number(game.timer_remaining_at_anchor ?? game.timer_remaining_seconds ?? 0);
    const stored    = Number(game.timer_remaining_seconds ?? atAnchor ?? 0);
    if (running && anchorTs > 0) {
      const rem = Math.max(0, atAnchor - (nowMs / 1000 - anchorTs));
      return { remaining: rem, isRunning: true };
    }
    return { remaining: stored, isRunning: false };
  }, [game, nowMs]);

  // ── Data loading ──────────────────────────────────────────────────────────
  async function loadGame({ quiet = false } = {}) {
    if (!quiet) { setErr(""); setLoading(true); }
    try {
      const { data, error } = await supabase.from("live_games").select("*").eq("id", gameId).single();
      if (error) throw error;
      setGame(data);
      if (isSeriesSport(data?.sport)) {
        const p = parseSeriesNotes(data.notes);
        setSeriesFormat(p.format); setSeriesA(p.seriesA); setSeriesB(p.seriesB);
      }
      // Open lineup popup automatically for softball if not done yet
      if (isSoftball(data?.sport) && !lineupDone) setLineupOpen(true);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  function refreshGame() { loadGame({ quiet: true }); }

  async function loadEventTotals(g) {
    const { data } = await supabase.from("live_events").select("player_id, stat_key, delta, event_type")
      .eq("game_id", g.id).eq("event_type", "stat").limit(10000);
    const totals = {};
    for (const row of data || []) {
      const k = `${row.player_id}:${row.stat_key}`;
      totals[k] = (totals[k] || 0) + Number(row.delta || 0);
    }
    setStatTotals(totals);
  }

  function refreshStats() { if (game) loadEventTotals(game); }

  function uniqNonEmpty(arr) {
    return Array.from(new Set((arr || []).map(norm).filter(Boolean)));
  }

  async function ensureRoster(g) {
    const { data: r1 } = await supabase.from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", g.id).order("team_side").order("sort_order").limit(5000);

    if (r1 && r1.length) {
      setRosterA(r1.filter((x) => x.team_side === "A"));
      setRosterB(r1.filter((x) => x.team_side === "B"));
      if (!r1.filter((x) => x.team_side === "A" && x.is_playing).length) setShowBenchA(true);
      if (!r1.filter((x) => x.team_side === "B" && x.is_playing).length) setShowBenchB(true);
      return;
    }

    const lk = norm(g.league_key);
    const a1 = norm(g.team_a1 || ""), b1 = norm(g.team_b1 || "");
    const a2 = norm(g.team_a2 || ""), b2 = norm(g.team_b2 || "");
    const mt = String(g.matchup_type || "single");

    const teamsA = uniqNonEmpty([a1, mt === "two_team" ? a2 : null]);
    const teamsB = uniqNonEmpty([b1, mt === "two_team" ? b2 : null]);
    const allTeams = uniqNonEmpty([...teamsA, ...teamsB]);

    if (mt === "full_team" || mt === "crest_cup") {
      teamsA.length = 0; teamsB.length = 0; teamsA.push(a1); teamsB.push(b1);
    }

    const pq = mt === "crest_cup"
      ? supabase.from("players").select("id, first_name, last_name, team_name, league_id").in("team_name", allTeams).limit(5000)
      : supabase.from("players").select("id, first_name, last_name, team_name, league_id").eq("league_id", lk).in("team_name", allTeams).limit(5000);

    const { data: players } = await pq;
    const oA = { v: 0 }, oB = { v: 0 };
    const rows = (players || []).map((p) => {
      const tn = norm(p.team_name);
      const side = teamsA.includes(tn) ? "A" : "B";
      const so = side === "A" ? oA.v++ : oB.v++;
      return { game_id: g.id, player_id: String(p.id), player_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), team_side: side, team_name: tn, is_playing: false, sort_order: so };
    });

    if (rows.length) {
      const chunk = 250;
      for (let i = 0; i < rows.length; i += chunk) {
        await supabase.from("game_roster").insert(rows.slice(i, i + chunk));
      }
    }

    const { data: r2 } = await supabase.from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", g.id).order("team_side").order("sort_order").limit(5000);

    setRosterA((r2 || []).filter((x) => x.team_side === "A"));
    setRosterB((r2 || []).filter((x) => x.team_side === "B"));
    setShowBenchA(true); setShowBenchB(true);
  }

  useEffect(() => { if (gameId) loadGame(); }, [gameId]);

  useEffect(() => {
    if (!game) return;
    (async () => {
      await ensureRoster(game);
      await loadEventTotals(game);
      try {
        const teamNames = uniqNonEmpty([game.team_a1 || game.team_a, game.team_b1 || game.team_b]);
        setCaptainIds(await fetchCaptainIds({ leagueId: norm(game.league_key), teamNames }));
      } catch {}
    })();
  }, [game?.id]);

  // ── Debounced action helper ───────────────────────────────────────────────
  // 300ms debounce prevents accidental double-taps without blocking buttons
  // for the full network round-trip like the old actionBusy did.
  function tap(fn) {
    return async (...args) => {
      if (tapRef.current) return;
      tapRef.current = true;
      setTimeout(() => { tapRef.current = false; }, 300);
      await fn(...args);
    };
  }

  async function updateLiveGame(patch) {
    const { data, error } = await supabase.from("live_games")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", game.id).select("*").single();
    if (error) { setErr(error.message); return null; }
    setGame(data);
    return data;
  }

  // ── Timer functions ───────────────────────────────────────────────────────
  const onStart = tap(async () => {
    const rem = derived.remaining;
    const nowSec = Date.now() / 1000;
    await updateLiveGame({ timer_running: true, timer_anchor_ts: nowSec, timer_remaining_at_anchor: Math.floor(rem), timer_remaining_seconds: Math.floor(rem) });
  });

  const onPause = tap(async () => {
    const rem = derived.remaining;
    await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: Math.floor(rem), timer_remaining_seconds: Math.floor(rem) });
  });

  const onReset = tap(async (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds)));
    await updateLiveGame({ timer_running: false, timer_anchor_ts: null, duration_seconds: s, timer_remaining_at_anchor: s, timer_remaining_seconds: s });
  });

  const setExactRemaining = tap(async (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds)));
    await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: s, timer_remaining_seconds: s });
  });

  async function openSetTimeModal() {
    if (!rules?.clock?.enabled) return;
    if (derived.isRunning) await onPause();
    setTimeInput(fmtClock(derived.remaining));
    setSetTimeOpen(true);
  }

  // ── Scoring functions — optimistic updates + background sync ─────────────
  const bumpScore = tap(async (side, delta) => {
    if (!game) return;
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Number(prev.score_a || 0) + d : Number(prev.score_a || 0),
      score_b: side === "B" ? Number(prev.score_b || 0) + d : Number(prev.score_b || 0),
    });
    const { error } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d });
    if (error) { setErr(error.message); refreshGame(); return; }
    refreshGame();
  });

  const undoScore = tap(async (side) => {
    if (!game) return;
    const current = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
    if (current <= 0) return;
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Math.max(0, Number(prev.score_a || 0) - 1) : Number(prev.score_a || 0),
      score_b: side === "B" ? Math.max(0, Number(prev.score_b || 0) - 1) : Number(prev.score_b || 0),
    });
    const { error } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 });
    if (error) { setErr(error.message); refreshGame(); return; }
    refreshGame();
  });

  const bumpStat = tap(async (player, statKey, delta) => {
    if (!game) return;
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    const key = `${player.player_id}:${norm(statKey)}`;
    setStatTotals((prev) => ({ ...prev, [key]: (prev[key] || 0) + d }));
    const { error } = await supabase.rpc("rpc_add_stat", {
      p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
      p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
      p_team_name: String(player?.team_name || ""), p_stat_key: norm(statKey), p_delta: d,
    });
    if (error) { setErr(error.message); refreshStats(); return; }
    refreshStats();
  });

  const undoStat = tap(async (player, statKey) => {
    if (!game) return;
    const key = `${player.player_id}:${norm(statKey)}`;
    const current = Number(statTotals[key] || 0);
    if (current <= 0) return;
    setStatTotals((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) }));
    const { error } = await supabase.rpc("rpc_add_stat", {
      p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
      p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
      p_team_name: String(player?.team_name || ""), p_stat_key: norm(statKey), p_delta: -1,
    });
    if (error) { setErr(error.message); refreshStats(); return; }
    refreshStats();
  });

  const bumpHoopPoints = tap(async (player, side, delta) => {
    if (!game) return;
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Number(prev.score_a || 0) + d : Number(prev.score_a || 0),
      score_b: side === "B" ? Number(prev.score_b || 0) + d : Number(prev.score_b || 0),
    });
    const ptsKey = `${player.player_id}:pts`;
    setStatTotals((prev) => ({ ...prev, [ptsKey]: (prev[ptsKey] || 0) + d }));
    const { error: e1 } = await supabase.rpc("rpc_add_stat", {
      p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
      p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
      p_team_name: String(player?.team_name || ""), p_stat_key: "pts", p_delta: d,
    });
    if (e1) { setErr(e1.message); refreshStats(); refreshGame(); return; }
    const { error: e2 } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d });
    if (e2) { setErr(e2.message); refreshStats(); refreshGame(); return; }
    refreshStats(); refreshGame();
  });

  const undoHoopPoints = tap(async (player, side) => {
    if (!game) return;
    const ptsKey = `${player.player_id}:pts`;
    if ((statTotals[ptsKey] || 0) <= 0) return;
    setStatTotals((prev) => ({ ...prev, [ptsKey]: Math.max(0, (prev[ptsKey] || 0) - 1) }));
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Math.max(0, Number(prev.score_a || 0) - 1) : Number(prev.score_a || 0),
      score_b: side === "B" ? Math.max(0, Number(prev.score_b || 0) - 1) : Number(prev.score_b || 0),
    });
    const { error: e1 } = await supabase.rpc("rpc_add_stat", {
      p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
      p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
      p_team_name: String(player?.team_name || ""), p_stat_key: "pts", p_delta: -1,
    });
    if (e1) { setErr(e1.message); refreshStats(); refreshGame(); return; }
    const sideScore = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
    if (sideScore > 0) {
      const { error: e2 } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 });
      if (e2) { setErr(e2.message); refreshStats(); refreshGame(); return; }
    }
    refreshStats(); refreshGame();
  });

  const bumpGoalWithScore = tap(async (player, side, delta) => {
    if (!game) return;
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Number(prev.score_a || 0) + d : Number(prev.score_a || 0),
      score_b: side === "B" ? Number(prev.score_b || 0) + d : Number(prev.score_b || 0),
    });
    const gKey = `${player.player_id}:g`;
    setStatTotals((prev) => ({ ...prev, [gKey]: (prev[gKey] || 0) + d }));
    const { error: e1 } = await supabase.rpc("rpc_add_stat", {
      p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
      p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
      p_team_name: String(player?.team_name || ""), p_stat_key: "g", p_delta: d,
    });
    if (e1) { setErr(e1.message); refreshStats(); refreshGame(); return; }
    const { error: e2 } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d });
    if (e2) { setErr(e2.message); refreshStats(); refreshGame(); return; }
    refreshStats(); refreshGame();
  });

  const undoGoalWithScore = tap(async (player, side) => {
    if (!game) return;
    const gKey = `${player.player_id}:g`;
    if ((statTotals[gKey] || 0) <= 0) return;
    setStatTotals((prev) => ({ ...prev, [gKey]: Math.max(0, (prev[gKey] || 0) - 1) }));
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Math.max(0, Number(prev.score_a || 0) - 1) : Number(prev.score_a || 0),
      score_b: side === "B" ? Math.max(0, Number(prev.score_b || 0) - 1) : Number(prev.score_b || 0),
    });
    const { error: e1 } = await supabase.rpc("rpc_add_stat", {
      p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
      p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
      p_team_name: String(player?.team_name || ""), p_stat_key: "g", p_delta: -1,
    });
    if (e1) { setErr(e1.message); refreshStats(); refreshGame(); return; }
    const sideScore = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
    if (sideScore > 0) {
      const { error: e2 } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 });
      if (e2) { setErr(e2.message); refreshStats(); refreshGame(); return; }
    }
    refreshStats(); refreshGame();
  });

  // ── togglePlaying — with debounce + optimistic update ────────────────────
  async function togglePlaying(player) {
    if (tapRef.current) return;
    tapRef.current = true;
    setTimeout(() => { tapRef.current = false; }, 300);
    setErr("");
    const next = !player.is_playing;
    const isBatting = isBattingSport(game?.sport);
    const side = player.team_side;
    const list = side === "A" ? rosterA : rosterB;
    let newSortOrder = player.sort_order;
    if (next && isBatting) {
      const activeOrders = list.filter((p) => p.is_playing && p.player_id !== player.player_id).map((p) => Number(p.sort_order || 0));
      newSortOrder = activeOrders.length ? Math.max(...activeOrders) + 1 : 0;
    }
    // Optimistic
    const apply = (arr) => arr.map((p) => p.player_id === player.player_id ? { ...p, is_playing: next, sort_order: newSortOrder } : p);
    if (side === "A") setRosterA((r) => apply(r));
    else setRosterB((r) => apply(r));

    const patch = next && isBatting ? { is_playing: next, sort_order: newSortOrder } : { is_playing: next };
    const { error } = await supabase.from("game_roster").update(patch).eq("game_id", player.game_id).eq("player_id", player.player_id);
    if (error) {
      setErr(error.message);
      // revert
      const revert = (arr) => arr.map((p) => p.player_id === player.player_id ? { ...p, is_playing: !next } : p);
      if (side === "A") setRosterA((r) => revert(r));
      else setRosterB((r) => revert(r));
    }
  }

  async function moveInOrder(player, dir) {
    if (!isBattingSport(game?.sport)) return;
    const side = player.team_side;
    const list = side === "A" ? rosterA : rosterB;
    const idx = list.findIndex((p) => p.player_id === player.player_id);
    if (idx < 0) return;
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= list.length) return;
    const a = list[idx], b = list[j];
    const next = [...list];
    next[idx] = { ...a, sort_order: b.sort_order };
    next[j]   = { ...b, sort_order: a.sort_order };
    next.sort((x, y) => Number(x.sort_order || 0) - Number(y.sort_order || 0));
    if (side === "A") setRosterA(next); else setRosterB(next);
    await supabase.from("game_roster").update({ sort_order: b.sort_order }).eq("game_id", a.game_id).eq("player_id", a.player_id);
    await supabase.from("game_roster").update({ sort_order: a.sort_order }).eq("game_id", b.game_id).eq("player_id", b.player_id);
  }

  // ── Softball at-bat handler ───────────────────────────────────────────────
  async function recordAtBat(outcome) {
    if (tapRef.current || !game) return;
    tapRef.current = true;
    setTimeout(() => { tapRef.current = false; }, 300);

    const battingRoster = (battingTeam === "A" ? rosterA : rosterB).filter((p) => p.is_playing).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    if (!battingRoster.length) return;

    const batter = battingRoster[currentBatterIdx % battingRoster.length];

    // Log stat if applicable
    if (outcome.statKey && batter) {
      const key = `${batter.player_id}:${outcome.statKey}`;
      setStatTotals((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
      supabase.rpc("rpc_add_stat", {
        p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
        p_player_id: String(batter.player_id), p_player_name: String(batter.player_name || batter.player_id),
        p_team_name: String(batter.team_name || ""), p_stat_key: outcome.statKey, p_delta: 1,
      }).then(({ error }) => { if (error) refreshStats(); });
    }

    // Record locally
    setAtBatResults((prev) => [...prev, {
      playerId: batter.player_id,
      playerName: batter.player_name,
      outcome: outcome.key,
      label: outcome.label,
      inning,
      half: inningHalf,
    }]);

    // Handle outs
    let newOuts = outsThisHalf;
    if (outcome.isOut) {
      newOuts = outsThisHalf + 1;
      if (newOuts >= 3) {
        // 3 outs — flip sides
        newOuts = 0;
        if (inningHalf === "top") {
          setInningHalf("bottom");
          setBattingTeam(homeTeam);
        } else {
          setInningHalf("top");
          setInning((v) => v + 1);
          setBattingTeam(homeTeam === "A" ? "B" : "A");
        }
        setCurrentBatterIdx(0);
        setOutsThisHalf(0);
        return;
      }
    }
    setOutsThisHalf(newOuts);
    // Advance to next batter
    setCurrentBatterIdx((prev) => (prev + 1) % battingRoster.length);
  }

  // ── Series / endSet ───────────────────────────────────────────────────────
  async function endSet() {
    if (tapRef.current || !game) return;
    tapRef.current = true;
    setTimeout(() => { tapRef.current = false; }, 300);
    const sa = Number(game.score_a || 0), sb = Number(game.score_b || 0);
    if (sa === sb) { setErr("Set is tied. A set must have a winner before ending it."); return; }
    const newSA = sa > sb ? seriesA + 1 : seriesA;
    const newSB = sb > sa ? seriesB + 1 : seriesB;
    const notes = stringifySeriesNotes(seriesFormat, newSA, newSB);
    const { data, error } = await supabase.from("live_games").update({ score_a: 0, score_b: 0, notes, updated_at: new Date().toISOString() }).eq("id", game.id).select("*").single();
    if (error) { setErr(error.message); return; }
    setGame(data); setSeriesA(newSA); setSeriesB(newSB);
  }

  // ── Finalize ──────────────────────────────────────────────────────────────
  async function finalizeGame() {
    if (!game || finalizing) return;
    setErr("");
    if (isSeriesSport(game.sport)) {
      const majority = Math.floor(seriesFormat / 2) + 1;
      if (seriesA < majority && seriesB < majority) { setErr(`Series isn't decided yet. Need ${majority} set wins (currently ${seriesA}-${seriesB}).`); return; }
      if (seriesA === seriesB) { setErr("Series is tied. End another set before finalizing."); return; }
      setFinalizing(true);
      try {
        const g2 = await updateLiveGame({ score_a: seriesA, score_b: seriesB });
        if (!g2) return;
        const { error } = await supabase.rpc("finalize_game", { gid: game.id });
        if (error) { setErr(error.message); return; }
        router.push("/");
      } finally { setFinalizing(false); }
      return;
    }
    if (rules?.clock?.enabled && derived.isRunning) { setErr("Pause the clock before finalizing."); return; }
    const sa = Number(game.score_a || 0), sb = Number(game.score_b || 0);
    if (sa === 0 && sb === 0) { setErr("Score is 0-0. Add points before finalizing."); return; }
    if (sa === sb) { setErr("Score is tied. Bauercrest has no ties — adjust before finalizing."); return; }
    setFinalizing(true);
    try {
      if (rules?.clock?.enabled) {
        const rem = Math.floor(derived.remaining);
        const g2 = await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: rem, timer_remaining_seconds: rem });
        if (!g2) return;
      }
      const { error } = await supabase.rpc("finalize_game", { gid: game.id });
      if (error) { setErr(error.message); return; }
      router.push("/");
    } finally { setFinalizing(false); }
  }

  // ── Early returns ─────────────────────────────────────────────────────────
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0a1628] text-white text-lg font-bold">Loading…</div>;
  if (!game)   return <div className="flex min-h-screen items-center justify-center bg-[#0a1628] text-red-300 text-lg font-bold p-6">{err || "Game not found."}</div>;

  // ── Derived values ────────────────────────────────────────────────────────
  const leftLabel  = game.matchup_type === "two_team" ? matchupLabel(game.team_a1, game.team_a2) : norm(game.team_a1);
  const rightLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_b1, game.team_b2) : norm(game.team_b1);
  const scoreA = Number(game.score_a || 0);
  const scoreB = Number(game.score_b || 0);

  function getVal(pid, statKey) { return Number(statTotals[`${pid}:${norm(statKey)}`] || 0); }

  const playingA = rosterA.filter((p) => p.is_playing).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const benchA   = rosterA.filter((p) => !p.is_playing);
  const playingB = rosterB.filter((p) => p.is_playing).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const benchB   = rosterB.filter((p) => !p.is_playing);

  const scoreButtons  = rules?.scoreButtons?.length ? rules.scoreButtons : [1];
  const statDefs      = rules?.stats ?? [];
  const isHoop        = norm(game.sport) === "hoop";
  const isSoftballGame = isSoftball(game.sport);
  const noStat        = isNoStatSport(rules);
  const clockPresets  = activeClockMode?.presets ?? [300, 600, 900, 1200, 1800];
  const chipPad = superCompact ? "px-2 py-1" : "px-3 py-2";
  const chipText = superCompact ? "text-[11px]" : "text-sm";

  // Softball batting roster for the active batting team
  const battingRoster = (battingTeam === "A" ? playingA : playingB);
  const currentBatter = battingRoster[currentBatterIdx % Math.max(1, battingRoster.length)];

  // ── Sub-components ────────────────────────────────────────────────────────
  function StatChip({ p, sd, side }) {
    const deltas = sd?.deltas?.length ? sd.deltas : [1];
    const v = getVal(p.player_id, sd.key);
    const isGoal = sd.key === "g" && GOAL_AUTO_SCORE_SPORTS.includes(norm(game?.sport));
    const handleBump = (d) => isGoal ? bumpGoalWithScore(p, side, d) : bumpStat(p, sd.key, d);
    const handleUndo = () => isGoal ? undoGoalWithScore(p, side) : undoStat(p, sd.key);
    return (
      <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-white/50">{sd.label}</span>
        <span className="min-w-[18px] text-center text-sm font-black tabular-nums text-white">{v}</span>
        <button onClick={handleUndo} disabled={v <= 0}
          className={`flex-1 rounded border border-red-500/30 bg-red-500/10 ${chipPad} ${chipText} font-black text-red-300 active:scale-95 disabled:opacity-20`}>-1</button>
        {deltas.map((d) => (
          <button key={d} onClick={() => handleBump(d)}
            className={`flex-1 rounded border border-white/10 bg-white/10 ${chipPad} ${chipText} font-black active:scale-95`}>+{d}</button>
        ))}
      </div>
    );
  }

  function PlayerRow({ p, idx, total, side }) {
    const showBatting = isBattingSport(game?.sport);
    const isCap = captainIds instanceof Set ? captainIds.has(String(p.player_id)) : false;
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
        <div className="flex items-center justify-between gap-2">
          {showBatting ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="w-5 text-center text-[10px] font-black opacity-60">{idx + 1}</span>
              <button onClick={() => moveInOrder(p, "up")} disabled={idx === 0} className="rounded border border-white/10 bg-white/10 px-2 py-1.5 text-[10px] font-black disabled:opacity-30">↑</button>
              <button onClick={() => moveInOrder(p, "down")} disabled={idx === total - 1} className="rounded border border-white/10 bg-white/10 px-2 py-1.5 text-[10px] font-black disabled:opacity-30">↓</button>
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-white">{isCap ? "⭐ " : ""}{p.player_name || p.player_id}</div>
          </div>
          <button onClick={() => togglePlaying(p)}
            className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-[11px] font-black text-red-300 active:scale-95">Out</button>
        </div>
        {statDefs.length > 0 && (
          <div className="mt-2 flex gap-1.5">
            {statDefs.map((sd) => <StatChip key={`${p.player_id}-${sd.key}`} p={p} sd={sd} side={side} />)}
          </div>
        )}
      </div>
    );
  }

  function hoopShortName(n) {
    const parts = String(n || "").trim().split(/\s+/);
    if (parts.length < 2) return n || "";
    return `${parts[0].charAt(0)}. ${parts.slice(1).join(" ")}`;
  }

  function HoopPlayerRow({ p, side }) {
    const isCap = captainIds instanceof Set ? captainIds.has(String(p.player_id)) : false;
    const pts   = getVal(p.player_id, "pts");
    const fouls = getVal(p.player_id, "foul");
    return (
      <div className="flex items-end gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
        <div className="min-w-0 flex-1 self-center">
          <div className="truncate text-[13px] font-black text-white">{isCap ? "⭐ " : ""}{hoopShortName(p.player_name || p.player_id)}</div>
        </div>
        <div className="flex flex-col items-center shrink-0">
          <span className="text-[8px] font-black uppercase leading-tight text-white/40">PTS · {pts}</span>
          <div className="mt-0.5 flex items-center gap-1">
            <button onClick={() => undoHoopPoints(p, side)} disabled={pts <= 0}
              className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] font-black text-red-300 active:scale-95 disabled:opacity-20">-1</button>
            {[1, 2, 3].map((d) => (
              <button key={d} onClick={() => bumpHoopPoints(p, side, d)}
                className="rounded border border-white/15 bg-white/10 px-2 py-1.5 text-[10px] font-black active:scale-95">+{d}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center shrink-0 border-l border-white/10 pl-1.5">
          <span className="text-[8px] font-black uppercase leading-tight text-white/40">F · {fouls}</span>
          <div className="mt-0.5 flex items-center gap-1">
            <button onClick={() => undoStat(p, "foul")} disabled={fouls <= 0}
              className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] font-black text-red-300 active:scale-95 disabled:opacity-20">-1</button>
            <button onClick={() => bumpStat(p, "foul", 1)}
              className="rounded border border-white/15 bg-white/10 px-2 py-1.5 text-[10px] font-black active:scale-95">+1</button>
          </div>
        </div>
        <button onClick={() => togglePlaying(p)}
          className="shrink-0 self-center rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] font-black text-red-300 active:scale-95">Out</button>
      </div>
    );
  }

  function BenchRow({ p }) {
    const isCap = captainIds instanceof Set ? captainIds.has(String(p.player_id)) : false;
    return (
      <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
        <span className="truncate text-xs font-semibold text-white/70">{isCap ? "⭐ " : ""}{p.player_name || p.player_id}</span>
        <button onClick={() => togglePlaying(p)}
          className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] font-black text-emerald-300 active:scale-95">In</button>
      </div>
    );
  }

  // ── Softball lineup popup ─────────────────────────────────────────────────
  function LineupModal() {
    return (
      <div className="fixed inset-0 z-[60] flex items-end bg-black/80 sm:items-center sm:justify-center">
        <div className="w-full max-w-2xl rounded-t-3xl border border-white/15 bg-[#08172c] p-5 sm:rounded-3xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-black text-white">Set Lineup</div>
              <div className="mt-0.5 text-xs text-white/50">Mark who's In, set batting order, pick Home team. Then tap Done — this won't reopen.</div>
            </div>
          </div>

          {/* Home / Away toggle */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-white/40">Home team:</span>
            <button
              onClick={() => setHomeTeam("A")}
              className={`rounded-xl border px-4 py-2 text-xs font-black transition ${homeTeam === "A" ? "border-blue-400/60 bg-blue-500/20 text-blue-200" : "border-white/10 bg-white/5 text-white/40"}`}>
              {leftLabel}
            </button>
            <button
              onClick={() => setHomeTeam("B")}
              className={`rounded-xl border px-4 py-2 text-xs font-black transition ${homeTeam === "B" ? "border-blue-400/60 bg-blue-500/20 text-blue-200" : "border-white/10 bg-white/5 text-white/40"}`}>
              {rightLabel}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto">
            {/* Team A */}
            <div>
              <div className="mb-2 text-xs font-black uppercase tracking-wider text-white/60">{leftLabel}</div>
              <div className="space-y-1">
                {rosterA.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((p, idx) => (
                  <div key={p.player_id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${p.is_playing ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/5 bg-white/[0.02]"}`}>
                    {p.is_playing ? <span className="w-4 text-center text-[10px] font-black text-white/50">{playingA.findIndex((x) => x.player_id === p.player_id) + 1}</span> : <span className="w-4" />}
                    <span className="flex-1 truncate text-[11px] font-semibold text-white">{p.player_name}</span>
                    <div className="flex items-center gap-0.5">
                      {p.is_playing && (
                        <>
                          <button onClick={() => moveInOrder(p, "up")} className="rounded border border-white/10 bg-white/10 px-1 py-0.5 text-[9px] font-black">↑</button>
                          <button onClick={() => moveInOrder(p, "down")} className="rounded border border-white/10 bg-white/10 px-1 py-0.5 text-[9px] font-black">↓</button>
                        </>
                      )}
                      <button onClick={() => togglePlaying(p)}
                        className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${p.is_playing ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
                        {p.is_playing ? "Out" : "In"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team B */}
            <div>
              <div className="mb-2 text-xs font-black uppercase tracking-wider text-white/60">{rightLabel}</div>
              <div className="space-y-1">
                {rosterB.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((p, idx) => (
                  <div key={p.player_id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${p.is_playing ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/5 bg-white/[0.02]"}`}>
                    {p.is_playing ? <span className="w-4 text-center text-[10px] font-black text-white/50">{playingB.findIndex((x) => x.player_id === p.player_id) + 1}</span> : <span className="w-4" />}
                    <span className="flex-1 truncate text-[11px] font-semibold text-white">{p.player_name}</span>
                    <div className="flex items-center gap-0.5">
                      {p.is_playing && (
                        <>
                          <button onClick={() => moveInOrder(p, "up")} className="rounded border border-white/10 bg-white/10 px-1 py-0.5 text-[9px] font-black">↑</button>
                          <button onClick={() => moveInOrder(p, "down")} className="rounded border border-white/10 bg-white/10 px-1 py-0.5 text-[9px] font-black">↓</button>
                        </>
                      )}
                      <button onClick={() => togglePlaying(p)}
                        className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${p.is_playing ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
                        {p.is_playing ? "Out" : "In"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              // Away team bats first
              setBattingTeam(homeTeam === "A" ? "B" : "A");
              setCurrentBatterIdx(0);
              setOutsThisHalf(0);
              setLineupDone(true);
              setLineupOpen(false);
            }}
            className="mt-5 w-full rounded-2xl bg-blue-600 py-4 text-base font-black text-white active:scale-[0.98]">
            Done — Start Game
          </button>
        </div>
      </div>
    );
  }

  // ── Softball at-bat UI ────────────────────────────────────────────────────
  function SoftballAtBatPanel() {
    const battingLabel = battingTeam === "A" ? leftLabel : rightLabel;
    const battingSide  = battingTeam;

    const colorMap = {
      emerald: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 active:bg-emerald-500/30",
      amber:   "border-amber-400/40 bg-amber-500/15 text-amber-200 active:bg-amber-500/30",
      blue:    "border-blue-400/40 bg-blue-500/15 text-blue-200 active:bg-blue-500/30",
      red:     "border-red-500/40 bg-red-500/15 text-red-300 active:bg-red-500/30",
      orange:  "border-orange-400/40 bg-orange-500/15 text-orange-200 active:bg-orange-500/30",
    };

    return (
      <div className="p-3 space-y-3">
        {/* Current batter */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/70">Now Batting · {battingLabel}</div>
              <div className="mt-1 text-3xl font-black text-white">
                {currentBatter ? currentBatter.player_name : "—"}
              </div>
              {currentBatter && (
                <div className="mt-0.5 text-xs text-white/40">
                  #{(currentBatterIdx % Math.max(1, battingRoster.length)) + 1} in order · H: {getVal(currentBatter.player_id, "h")} · HR: {getVal(currentBatter.player_id, "hr")}
                </div>
              )}
            </div>
            {/* Outs indicator */}
            <div className="flex flex-col items-center gap-1">
              <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Outs</div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`h-4 w-4 rounded-full border-2 transition-colors ${i < outsThisHalf ? "border-red-400 bg-red-400" : "border-white/20 bg-transparent"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* At-bat outcome buttons */}
        <div className="grid grid-cols-4 gap-2">
          {AT_BAT_OUTCOMES.map((o) => (
            <button
              key={o.key}
              onClick={() => recordAtBat(o)}
              className={`rounded-xl border py-4 text-lg font-black active:scale-95 ${colorMap[o.color]}`}>
              {o.label}
            </button>
          ))}
        </div>

        {/* Recent at-bats this half inning */}
        {atBatResults.filter((r) => r.inning === inning && r.half === inningHalf).length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">This half inning</div>
            <div className="flex flex-wrap gap-1.5">
              {atBatResults.filter((r) => r.inning === inning && r.half === inningHalf).map((r, i) => (
                <span key={i} className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-black text-white/60">
                  {r.playerName?.split(" ")[0]}: {r.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Batting order list */}
        <div className="grid grid-cols-2 gap-2">
          {[{ side: "A", roster: playingA, label: leftLabel }, { side: "B", roster: playingB, label: rightLabel }].map(({ side, roster, label }) => (
            <div key={side} className={`rounded-xl border p-2 ${battingTeam === side ? "border-blue-500/30 bg-blue-500/5" : "border-white/5 bg-white/[0.02]"}`}>
              <div className="mb-1 text-[9px] font-black uppercase tracking-wider text-white/40">{label} {battingTeam === side ? "· Batting" : ""}</div>
              <div className="space-y-0.5">
                {roster.map((p, idx) => {
                  const isUp = battingTeam === side && idx === (currentBatterIdx % Math.max(1, roster.length));
                  return (
                    <div key={p.player_id} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] ${isUp ? "bg-blue-500/20 font-black text-white" : "text-white/40"}`}>
                      <span className="w-3 text-[9px]">{idx + 1}</span>
                      <span className="truncate">{p.player_name?.split(" ")[0]}</span>
                      {isUp && <span className="ml-auto text-[9px] text-blue-400">▶</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-[#0a1628] text-white">

      {!isOnline && (
        <div className="sticky top-0 z-50 bg-red-600 px-4 py-2.5 text-center text-sm font-black text-white">
          ⚠️ NO WIFI — Scores are NOT saving. Reconnect before continuing.
        </div>
      )}

      {err && (
        <div className="px-3 pt-2">
          <div className="rounded-lg border border-red-700 bg-red-950/50 px-3 py-2 text-xs font-bold text-red-200">{err}</div>
        </div>
      )}

      {/* Top bar */}
      {showTopBar ? (
        <div className="flex items-center justify-between border-b border-white/10 bg-[#06101f] px-3 py-2">
          <div className="min-w-0 truncate text-[11px] font-bold uppercase tracking-widest text-white/40">
            {game.league_key} · {game.sport} · {game.level} · {game.mode}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSuperCompact((v) => !v)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-white/60">
              {superCompact ? "Compact" : "Large"}
            </button>
            <button onClick={() => router.push("/")}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-white/60">Home</button>
            <button onClick={() => setShowTopBar(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-bold text-white/60">▲</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowTopBar(true)}
          className="flex w-full items-center justify-center border-b border-white/10 bg-[#06101f] py-1 text-white/30">
          <span className="text-[10px]">☰</span>
        </button>
      )}

      {/* ── SCOREBOARD ── */}
      <div className="border-b border-white/10 bg-[#07112a] px-3 py-2">
        {isHoop ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">{leftLabel}</div>
              <div className="text-2xl font-black tabular-nums text-white">{scoreA}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              {rules?.clock?.enabled ? (
                <>
                  <button onClick={openSetTimeModal}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xl font-black tabular-nums text-white active:scale-[0.98]">
                    {fmtClock(derived.remaining)}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {game.timer_running
                      ? <button onClick={onPause} className="rounded-lg bg-white px-4 py-2 text-xs font-black text-black active:scale-95">Pause</button>
                      : <button onClick={onStart} className="rounded-lg bg-white px-4 py-2 text-xs font-black text-black active:scale-95">Start</button>}
                    <button onClick={() => onReset(game.duration_seconds || clockPresets[clockPresets.length - 1] || 1800)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black active:scale-95">Reset</button>
                    <button onClick={() => setConfirmFinalizeOpen(true)}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-black text-emerald-200 active:scale-95">Finalize</button>
                  </div>
                </>
              ) : (
                <button onClick={() => setConfirmFinalizeOpen(true)}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-200 active:scale-95">Finalize</button>
              )}
            </div>
            <div className="text-right">
              <div className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">{rightLabel}</div>
              <div className="text-2xl font-black tabular-nums text-white">{scoreB}</div>
            </div>
          </div>
        ) : noStat ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
            <button onClick={() => bumpScore("A", 1)}
              className="flex min-h-[150px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-2 py-3 active:scale-[0.98] active:bg-white/10">
              <div className="truncate text-sm font-black uppercase tracking-widest text-blue-400/70">{leftLabel}</div>
              <div className="mt-1 text-8xl font-black leading-none tabular-nums text-white">{scoreA}</div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/30">Tap · +1</div>
            </button>
            <div className="flex flex-col items-center justify-center gap-2 px-1">
              {isSeriesSport(game.sport) ? (
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Series (Bo{seriesFormat})</div>
                  <div className="text-5xl font-black tabular-nums text-white">{seriesA} - {seriesB}</div>
                  <button onClick={endSet} disabled={scoreA === scoreB}
                    className="mt-1 rounded-xl border border-amber-400/40 bg-amber-500/15 px-6 py-3 text-base font-black text-amber-200 active:scale-95 disabled:opacity-30">End Set</button>
                </div>
              ) : null}
              {norm(game.sport) === "kickball" ? (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">{inningHalf === "top" ? "▲ TOP" : "▼ BOT"}</div>
                  <div className="text-4xl font-black tabular-nums text-white">{inning}</div>
                  <button onClick={() => {
                    if (inningHalf === "top") { setInningHalf("bottom"); }
                    else { setInningHalf("top"); setInning((v) => v + 1); }
                  }} className="mt-1 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-black active:scale-95">Next Half</button>
                </div>
              ) : null}
              <button onClick={() => setConfirmFinalizeOpen(true)}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-6 py-3 text-base font-black text-emerald-200 active:scale-95">Finalize</button>
              <div className="flex items-center gap-2">
                <button onClick={() => undoScore("A")} disabled={scoreA <= 0}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black text-red-300 active:scale-95 disabled:opacity-20">{leftLabel} -1</button>
                <button onClick={() => undoScore("B")} disabled={scoreB <= 0}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black text-red-300 active:scale-95 disabled:opacity-20">{rightLabel} -1</button>
              </div>
            </div>
            <button onClick={() => bumpScore("B", 1)}
              className="flex min-h-[150px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-2 py-3 active:scale-[0.98] active:bg-white/10">
              <div className="truncate text-sm font-black uppercase tracking-widest text-blue-400/70">{rightLabel}</div>
              <div className="mt-1 text-8xl font-black leading-none tabular-nums text-white">{scoreB}</div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/30">Tap · +1</div>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/60">Home</div>
              <div className="mt-0.5 truncate text-base font-black text-white">{leftLabel}</div>
              <div className="mt-1 text-5xl font-black tabular-nums text-white">{scoreA}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => undoScore("A")} disabled={scoreA <= 0}
                  className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20">-1</button>
                {scoreButtons.map((d) => (
                  <button key={`A-${d}`} onClick={() => bumpScore("A", d)}
                    className="flex-1 rounded-lg border border-white/15 bg-white/10 py-2 text-sm font-black active:scale-95">+{d}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 px-2">
              {rules?.clock?.enabled ? (
                <>
                  <button onClick={openSetTimeModal}
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-3xl font-black tabular-nums text-white active:scale-[0.98]">
                    {fmtClock(derived.remaining)}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {game.timer_running
                      ? <button onClick={onPause} className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black active:scale-95">Pause</button>
                      : <button onClick={onStart} className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black active:scale-95">Start</button>}
                    <button onClick={() => onReset(game.duration_seconds || clockPresets[clockPresets.length - 1] || 1800)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black active:scale-95">Reset</button>
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-0.5 max-w-[120px]">
                    {clockPresets.map((s) => (
                      <button key={`preset-${s}`} onClick={() => onReset(s)}
                        className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] font-bold active:scale-95">
                        {fmtClock(s)}
                      </button>
                    ))}
                  </div>
                  {rules?.clock?.modes?.length > 1 && (
                    <select value={clockMode} onChange={(e) => setClockMode(e.target.value)}
                      className="rounded-lg border border-white/10 bg-[#0a1628] px-2 py-1 text-[10px] font-bold text-white outline-none">
                      {rules.clock.modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40">No Clock</div>
                </div>
              )}
              {isSeriesSport(game.sport) && (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Series (Bo{seriesFormat})</div>
                  <div className="text-2xl font-black tabular-nums text-white">{seriesA} - {seriesB}</div>
                  <button onClick={endSet} disabled={scoreA === scoreB}
                    className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-200 active:scale-95 disabled:opacity-30">End Set</button>
                </div>
              )}
              {isSoftballGame && (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">{inningHalf === "top" ? "▲ TOP" : "▼ BOT"}</div>
                  <div className="text-2xl font-black tabular-nums text-white">{inning}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/20 h-3">{inningHalf === "bottom" ? "▲" : ""}</div>
                  <button onClick={() => {
                    if (inningHalf === "top") { setInningHalf("bottom"); setBattingTeam(homeTeam); }
                    else { setInningHalf("top"); setInning((v) => v + 1); setBattingTeam(homeTeam === "A" ? "B" : "A"); setCurrentBatterIdx(0); setOutsThisHalf(0); }
                  }} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black active:scale-95">Next Half</button>
                </div>
              )}
              <button onClick={() => setConfirmFinalizeOpen(true)}
                className="mt-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-200 active:scale-95">Finalize</button>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/60">Away</div>
              <div className="mt-0.5 truncate text-base font-black text-white">{rightLabel}</div>
              <div className="mt-1 text-5xl font-black tabular-nums text-white">{scoreB}</div>
              <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                {scoreButtons.map((d) => (
                  <button key={`B-${d}`} onClick={() => bumpScore("B", d)}
                    className="flex-1 rounded-lg border border-white/15 bg-white/10 py-2 text-sm font-black active:scale-95">+{d}</button>
                ))}
                <button onClick={() => undoScore("B")} disabled={scoreB <= 0}
                  className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20">-1</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── BODY — softball gets at-bat UI, everything else gets rosters ── */}
      {isSoftballGame && lineupDone ? (
        <SoftballAtBatPanel />
      ) : !noStat ? (
        <div className="grid grid-cols-2 gap-2 p-3">
          {[
            { side: "A", label: leftLabel, playing: playingA, bench: benchA, show: showBenchA, setShow: setShowBenchA, roster: rosterA },
            { side: "B", label: rightLabel, playing: playingB, bench: benchB, show: showBenchB, setShow: setShowBenchB, roster: rosterB },
          ].map(({ side, label, playing, bench, show, setShow, roster }) => (
            <div key={side} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-wider text-white/60">{label}</div>
                <button onClick={() => setShow((v) => !v)}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/50">
                  {show ? "Bench ▲" : `Bench (${bench.length}) ▼`}
                </button>
              </div>
              <div className="space-y-1.5">
                {playing.length ? (
                  playing.map((p) => {
                    const idx = roster.findIndex((x) => x.player_id === p.player_id);
                    return norm(game.sport) === "hoop"
                      ? <HoopPlayerRow key={p.player_id} p={p} side={side} />
                      : <PlayerRow key={p.player_id} p={p} idx={Math.max(0, idx)} total={roster.length} side={side} />;
                  })
                ) : (
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px] text-white/40">
                    No one in yet — open bench + tap In
                  </div>
                )}
              </div>
              {show && (
                <div className="mt-2 space-y-1">
                  {bench.length ? bench.map((p) => <BenchRow key={p.player_id} p={p} />) : <div className="text-[10px] text-white/30">No bench.</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 pt-3 text-center text-[11px] text-white/30">
          {leftLabel} vs {rightLabel} — no stats tracked for this sport.
        </div>
      )}

      <div className="px-3 pb-8 text-[10px] text-white/20">ID: {String(game.id)}</div>

      {/* Lineup modal */}
      {lineupOpen && <LineupModal />}

      {/* Set time modal */}
      {setTimeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#08172c] p-5">
            <div className="text-lg font-black">Set Clock Time</div>
            <div className="mt-1 text-sm text-white/60">Enter time as mm:ss. Clock will stay paused.</div>
            <input value={timeInput} onChange={(e) => setTimeInput(formatMMSSFromDigits(e.target.value))}
              inputMode="numeric" placeholder="mm:ss"
              className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-3xl font-black tracking-widest text-white outline-none focus:border-white/30" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setSetTimeOpen(false)} className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold">Cancel</button>
              <button className="flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-black"
                onClick={async () => {
                  const seconds = parseMMSS(timeInput);
                  if (seconds === null) { setErr("Time must be in mm:ss format (example: 11:05)."); return; }
                  setSetTimeOpen(false);
                  await setExactRemaining(seconds);
                  refreshGame();
                }}>Set Time</button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize modal */}
      {confirmFinalizeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#08172c] p-5">
            <div className="text-lg font-black">Finalize this game?</div>
            <div className="mt-2 text-sm text-white/60">Locks the score and updates standings + stat leaders.</div>
            {rules?.clock?.enabled && derived.isRunning && (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">Pause the clock before finalizing.</div>
            )}
            {(() => {
              if (isSeriesSport(game?.sport)) {
                const majority = Math.floor(seriesFormat / 2) + 1;
                if (seriesA < majority && seriesB < majority) return <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">⚠️ Series isn't decided yet. Need {majority} set wins (currently {seriesA}-{seriesB}).</div>;
                if (seriesA === seriesB) return <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">⚠️ Series is tied. End another set.</div>;
                return <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Series is {seriesA}-{seriesB}. This will be the final score.</div>;
              }
              const sa = Number(game?.score_a || 0), sb = Number(game?.score_b || 0);
              if (sa === 0 && sb === 0) return <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">⚠️ Score is 0-0. Add points before finalizing.</div>;
              if (sa === sb) return <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">⚠️ Score is tied ({sa}-{sb}). Bauercrest has no ties.</div>;
              return null;
            })()}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmFinalizeOpen(false)} className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold">Cancel</button>
              <button disabled={(rules?.clock?.enabled && derived.isRunning) || finalizing}
                className="flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-black disabled:opacity-40"
                onClick={finalizeGame}>
                {finalizing ? "Finalizing…" : "Finalize"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}