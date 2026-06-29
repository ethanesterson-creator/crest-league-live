"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds ?? 0)));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function parseMMSS(input) {
  const t = String(input ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const ss = Number(m[2]);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  return mm * 60 + ss;
}

function formatMMSSFromDigits(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 5);
  if (!digits) return "00:00";
  const secPart = digits.slice(-2).padStart(2, "0");
  const minPart = digits.slice(0, -2) || "0";
  const mm = String(Number(minPart)).padStart(2, "0");
  const ss = String(Math.min(59, Number(secPart))).padStart(2, "0");
  return `${mm}:${ss}`;
}

function matchupLabel(a1, a2) {
  const x1 = norm(a1);
  const x2 = norm(a2);
  if (x1 && x2 && x1 !== x2) return `${x1} + ${x2}`;
  return x1 || "—";
}

const isBattingSport = (s) => {
  const v = String(s || "").toLowerCase().trim();
  return v === "softball" || v === "kickball";
};

const isVolleyball = (s) => String(s || "").toLowerCase().trim() === "volleyball";
const isSeriesSport = (s) => {
  const v = String(s || "").toLowerCase().trim();
  return v === "volleyball" || v === "newcomb";
};

function parseSeriesNotes(notes) {
  try {
    const parsed = JSON.parse(notes || "{}");
    return {
      format: Number(parsed.series_format) || 3,
      seriesA: Number(parsed.series_a) || 0,
      seriesB: Number(parsed.series_b) || 0,
    };
  } catch {
    return { format: 3, seriesA: 0, seriesB: 0 };
  }
}

function stringifySeriesNotes(format, seriesA, seriesB) {
  return JSON.stringify({ series_format: format, series_a: seriesA, series_b: seriesB });
}

async function fetchCaptainIds({ leagueId, teamNames }) {
  if (!teamNames?.length) return new Set();
  const isCrestCup = norm(leagueId) === "crest_cup";
  if (!isCrestCup && !leagueId) return new Set();

  const query = isCrestCup
    ? supabase.from("players").select("id, role, team_name").in("team_name", teamNames)
    : supabase.from("players").select("id, role, team_name").eq("league_id", leagueId).in("team_name", teamNames);

  const { data, error } = await query;
  if (error) throw error;
  const capIds = new Set();
  for (const p of data || []) {
    const role = String(p.role || "").toLowerCase();
    if (role.includes("captain")) capIds.add(String(p.id));
  }
  return capIds;
}

export default function LiveGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params?.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [game, setGame] = useState(null);

  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);
  const [statTotals, setStatTotals] = useState({});

  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // Hard safety net: if actionBusy ever gets stuck true (a hung request,
  // a forgotten finally block in future code, bad WiFi never resolving),
  // force it back to false after 4 seconds so buttons never stay dead.
  useEffect(() => {
    if (!actionBusy) return;
    const t = setTimeout(() => setActionBusy(false), 4000);
    return () => clearTimeout(t);
  }, [actionBusy]);
  const [clockMode, setClockMode] = useState("");

  const [showBenchA, setShowBenchA] = useState(true);
  const [showBenchB, setShowBenchB] = useState(true);

  const [superCompact, setSuperCompact] = useState(true);
  const [showTopBar, setShowTopBar] = useState(true);

  const [setTimeOpen, setSetTimeOpen] = useState(false);
  const [timeInput, setTimeInput] = useState("00:00");

  const [captainIds, setCaptainIds] = useState(new Set());

  const [nowMs, setNowMs] = useState(Date.now());
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [inning, setInning] = useState(1);
  const [seriesFormat, setSeriesFormat] = useState(3);
  const [seriesA, setSeriesA] = useState(0);
  const [seriesB, setSeriesB] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const rules = useMemo(() => getSportRules(game?.sport), [game?.sport]);

  useEffect(() => {
    if (!rules?.clock?.enabled) return;
    const def = rules?.clock?.defaultMode || (rules?.clock?.modes?.[0]?.id ?? "");
    setClockMode(def);
  }, [rules?.clock?.enabled, rules?.clock?.defaultMode, rules?.clock?.modes]);

  const activeClockMode = useMemo(() => {
    if (!rules?.clock?.enabled) return null;
    const modes = rules?.clock?.modes ?? [];
    return modes.find((m) => m.id === clockMode) ?? modes[0] ?? null;
  }, [rules, clockMode]);

  const derived = useMemo(() => {
    if (!game) return { remaining: 0, isRunning: false };
    const running = !!game.timer_running;
    const anchorTs = Number(game.timer_anchor_ts ?? 0);
    const atAnchor = Number(game.timer_remaining_at_anchor ?? game.timer_remaining_seconds ?? 0);
    const remainingStored = Number(game.timer_remaining_seconds ?? atAnchor ?? 0);
    if (running && anchorTs > 0) {
      const nowSec = nowMs / 1000;
      const elapsed = Math.max(0, nowSec - anchorTs);
      const rem = Math.max(0, atAnchor - elapsed);
      return { remaining: rem, isRunning: true };
    }
    return { remaining: remainingStored, isRunning: false };
  }, [game, nowMs]);

  async function loadGame({ quiet = false } = {}) {
    if (!quiet) { setErr(""); setLoading(true); } else { setErr(""); }
    try {
      const { data, error } = await supabase.from("live_games").select("*").eq("id", gameId).single();
      if (error) throw error;
      setGame(data);
      if (isSeriesSport(data?.sport)) {
        const parsed = parseSeriesNotes(data.notes);
        setSeriesFormat(parsed.format);
        setSeriesA(parsed.seriesA);
        setSeriesB(parsed.seriesB);
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function refreshGame() { await loadGame({ quiet: true }); }

  async function backfillSortOrder(gameId2, rows) {
    try {
      const bySide = { A: [], B: [] };
      for (const r of rows || []) {
        const s = r.team_side === "A" ? "A" : "B";
        bySide[s].push(r);
      }
      for (const side of ["A", "B"]) {
        const list = bySide[side].slice().sort((x, y) => String(x.player_name || "").localeCompare(String(y.player_name || "")));
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          await supabase.from("game_roster").update({ sort_order: i }).eq("game_id", gameId2).eq("player_id", r.player_id);
        }
      }
    } catch { /* not fatal */ }
  }

  function uniqNonEmpty(arr) {
    return Array.from(new Set((arr || []).map((x) => norm(x)).filter(Boolean)));
  }

  async function ensureRoster(g) {
    setErr("");
    const { data: r1, error: rErr } = await supabase
      .from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", g.id)
      .order("team_side", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(5000);

    if (rErr) { setErr(rErr.message); return; }

    if (r1 && r1.length) {
      if (r1.some((x) => x.sort_order === null || x.sort_order === undefined)) {
        await backfillSortOrder(g.id, r1);
        const { data: r1b, error: r1bErr } = await supabase
          .from("game_roster")
          .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
          .eq("game_id", g.id)
          .order("team_side", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(5000);
        if (!r1bErr && r1b && r1b.length) {
          const a0 = r1b.filter((x) => x.team_side === "A");
          const b0 = r1b.filter((x) => x.team_side === "B");
          setRosterA(a0); setRosterB(b0);
          if (a0.filter((p) => p.is_playing).length === 0) setShowBenchA(true);
          if (b0.filter((p) => p.is_playing).length === 0) setShowBenchB(true);
          return;
        }
      }
      const a = r1.filter((x) => x.team_side === "A");
      const b = r1.filter((x) => x.team_side === "B");
      setRosterA(a); setRosterB(b);
      if (a.filter((p) => p.is_playing).length === 0) setShowBenchA(true);
      if (b.filter((p) => p.is_playing).length === 0) setShowBenchB(true);
      return;
    }

    const lk = norm(g.league_key);
    const a1 = norm(g.team_a1 || g.team_a || "");
    const b1 = norm(g.team_b1 || g.team_b || "");
    const a2 = norm(g.team_a2 || "");
    const b2 = norm(g.team_b2 || "");
    const matchupType = String(g.matchup_type || "single");

    const teamsA = uniqNonEmpty([a1, matchupType === "two_team" ? a2 : null]);
    const teamsB = uniqNonEmpty([b1, matchupType === "two_team" ? b2 : null]);
    const allTeams = uniqNonEmpty([...teamsA, ...teamsB]);

    if (matchupType === "full_team" || matchupType === "crest_cup") {
      teamsA.length = 0; teamsB.length = 0;
      teamsA.push(a1); teamsB.push(b1);
    }

    if (!allTeams.length) { setErr("Missing team info for this game."); return; }

    const playerQuery = matchupType === "crest_cup"
      ? supabase
          .from("players")
          .select("id, first_name, last_name, team_name, league_id")
          .in("team_name", allTeams)
          .limit(5000)
      : supabase
          .from("players")
          .select("id, first_name, last_name, team_name, league_id")
          .eq("league_id", lk)
          .in("team_name", allTeams)
          .limit(5000);

    const { data: players, error: pErr } = await playerQuery;

    if (pErr) { setErr(pErr.message); return; }

    const orderA = { v: 0 }; const orderB = { v: 0 };
    const rows = (players || []).map((p) => {
      const tn = norm(p.team_name);
      const side = teamsA.includes(tn) ? "A" : "B";
      const so = side === "A" ? orderA.v++ : orderB.v++;
      return { game_id: g.id, player_id: String(p.id), player_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), team_side: side, team_name: tn, is_playing: false, sort_order: so };
    });

    if (rows.length) {
      const chunk = 250;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error: insErr } = await supabase.from("game_roster").insert(rows.slice(i, i + chunk));
        if (insErr) { setErr(insErr.message); return; }
      }
    }

    const { data: r2, error: r2Err } = await supabase
      .from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", g.id)
      .order("team_side", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(5000);

    if (r2Err) { setErr(r2Err.message); return; }
    const a = (r2 || []).filter((x) => x.team_side === "A");
    const b = (r2 || []).filter((x) => x.team_side === "B");
    setRosterA(a); setRosterB(b);
    setShowBenchA(true); setShowBenchB(true);
  }

  async function loadEventTotals(g) {
    setErr("");
    const { data, error } = await supabase
      .from("live_events")
      .select("player_id, stat_key, delta, event_type, game_id")
      .eq("game_id", g.id)
      .eq("event_type", "stat")
      .limit(10000);
    if (error) { setErr(error.message); return; }
    const totals = {};
    for (const row of data || []) {
      const key = `${row.player_id}:${row.stat_key}`;
      totals[key] = (totals[key] || 0) + Number(row.delta || 0);
    }
    setStatTotals(totals);
  }

  async function refreshStats() { if (!game) return; await loadEventTotals(game); }

  useEffect(() => {
    if (!gameId) return;
    (async () => { await loadGame(); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!game) return;
    (async () => {
      await ensureRoster(game);
      await loadEventTotals(game);
      try {
        const teamNames = uniqNonEmpty([game.team_a1 || game.team_a, game.team_b1 || game.team_b]);
        const caps = await fetchCaptainIds({ leagueId: norm(game.league_key), teamNames });
        setCaptainIds(caps);
      } catch (e) { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  async function updateLiveGame(patch) {
    setErr("");
    const { data, error } = await supabase
      .from("live_games")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", game.id)
      .select("*")
      .single();
    if (error) { setErr(error.message); return null; }
    setGame(data);
    return data;
  }

  async function onStart() {
    if (!game || actionBusy) return;
    setActionBusy(true);
    try {
      const rem = derived.remaining;
      const nowSec = Date.now() / 1000;
      await updateLiveGame({ timer_running: true, timer_anchor_ts: nowSec, timer_remaining_at_anchor: Math.floor(rem), timer_remaining_seconds: Math.floor(rem) });
    } finally {
      setActionBusy(false);
    }
  }

  async function onPause() {
    if (!game || actionBusy) return;
    setActionBusy(true);
    try {
      const rem = derived.remaining;
      await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: Math.floor(rem), timer_remaining_seconds: Math.floor(rem) });
    } finally {
      setActionBusy(false);
    }
  }

  async function onReset(seconds) {
    if (!game || actionBusy) return;
    setActionBusy(true);
    try {
      const s = Math.max(0, Math.floor(Number(seconds)));
      await updateLiveGame({ timer_running: false, timer_anchor_ts: null, duration_seconds: s, timer_remaining_at_anchor: s, timer_remaining_seconds: s });
    } finally {
      setActionBusy(false);
    }
  }

  async function setExactRemaining(seconds) {
    if (!game || actionBusy) return;
    setActionBusy(true);
    try {
      const s = Math.max(0, Math.floor(Number(seconds)));
      await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: s, timer_remaining_seconds: s });
    } finally {
      setActionBusy(false);
    }
  }

  async function openSetTimeModal() {
    if (!rules?.clock?.enabled) return;
    if (derived.isRunning) await onPause();
    setTimeInput(fmtClock(derived.remaining));
    setSetTimeOpen(true);
  }

  const GOAL_AUTO_SCORE_SPORTS = ["euro", "soccer", "hockey", "speedball"];

  async function bumpScore(side, delta) {
    if (!game || actionBusy) return;
    setErr("");
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d });
      if (error) { setErr(error.message); return; }
      await refreshGame();
    } finally {
      setActionBusy(false);
    }
  }

  async function undoScore(side) {
    if (!game || actionBusy) return;
    setErr("");
    const current = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
    if (current <= 0) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 });
      if (error) { setErr(error.message); return; }
      await refreshGame();
    } finally {
      setActionBusy(false);
    }
  }

  async function undoStat(player, statKey) {
    if (!game || actionBusy) return;
    setErr("");
    const current = getVal(player.player_id, statKey);
    if (current <= 0) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("rpc_add_stat", {
        p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
        p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
        p_team_name: String(player?.team_name || ""), p_stat_key: norm(statKey), p_delta: -1,
      });
      if (error) { setErr(error.message); return; }
      await refreshStats();
    } finally {
      setActionBusy(false);
    }
  }

  async function bumpHoopPoints(player, side, delta) {
    if (!game || actionBusy) return;
    setErr("");
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    setActionBusy(true);
    try {
      const { error: statErr } = await supabase.rpc("rpc_add_stat", {
        p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
        p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
        p_team_name: String(player?.team_name || ""), p_stat_key: "pts", p_delta: d,
      });
      if (statErr) { setErr(statErr.message); return; }

      const { error: scoreErr } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d });
      if (scoreErr) { setErr(scoreErr.message); return; }

      await refreshStats();
      await refreshGame();
    } finally {
      setActionBusy(false);
    }
  }

  async function undoHoopPoints(player, side) {
    if (!game || actionBusy) return;
    setErr("");
    const current = getVal(player.player_id, "pts");
    if (current <= 0) return;
    setActionBusy(true);
    try {
      const { error: statErr } = await supabase.rpc("rpc_add_stat", {
        p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
        p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
        p_team_name: String(player?.team_name || ""), p_stat_key: "pts", p_delta: -1,
      });
      if (statErr) { setErr(statErr.message); return; }

      const sideScore = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
      if (sideScore > 0) {
        const { error: scoreErr } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 });
        if (scoreErr) { setErr(scoreErr.message); return; }
      }

      await refreshStats();
      await refreshGame();
    } finally {
      setActionBusy(false);
    }
  }

  async function bumpGoalWithScore(player, side, delta) {
    if (!game || actionBusy) return;
    setErr("");
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    setActionBusy(true);
    try {
      const { error: statErr } = await supabase.rpc("rpc_add_stat", {
        p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
        p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
        p_team_name: String(player?.team_name || ""), p_stat_key: "g", p_delta: d,
      });
      if (statErr) { setErr(statErr.message); return; }

      const { error: scoreErr } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d });
      if (scoreErr) { setErr(scoreErr.message); return; }

      await refreshStats();
      await refreshGame();
    } finally {
      setActionBusy(false);
    }
  }

  async function undoGoalWithScore(player, side) {
    if (!game || actionBusy) return;
    setErr("");
    const current = getVal(player.player_id, "g");
    if (current <= 0) return;
    setActionBusy(true);
    try {
      const { error: statErr } = await supabase.rpc("rpc_add_stat", {
        p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
        p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
        p_team_name: String(player?.team_name || ""), p_stat_key: "g", p_delta: -1,
      });
      if (statErr) { setErr(statErr.message); return; }

      const sideScore = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
      if (sideScore > 0) {
        const { error: scoreErr } = await supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 });
        if (scoreErr) { setErr(scoreErr.message); return; }
      }

      await refreshStats();
      await refreshGame();
    } finally {
      setActionBusy(false);
    }
  }

  async function bumpStat(player, statKey, delta) {
    if (!game || actionBusy) return;
    setErr("");
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("rpc_add_stat", {
        p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
        p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
        p_team_name: String(player?.team_name || ""), p_stat_key: norm(statKey), p_delta: d,
      });
      if (error) { setErr(error.message); return; }
      await refreshStats();
    } finally {
      setActionBusy(false);
    }
  }

  async function togglePlaying(player) {
    setErr("");
    const next = !player.is_playing;
    const isBatting = isBattingSport(game?.sport);
    const side = player.team_side;
    const list = side === "A" ? rosterA : rosterB;

    let newSortOrder = player.sort_order;

    // When activating a player into a batting sport, put them at the END
    // of the current active batting order, not whatever sort_order they
    // were assigned at roster creation time.
    if (next && isBatting) {
      const activeOrders = list
        .filter((p) => p.is_playing && p.player_id !== player.player_id)
        .map((p) => Number(p.sort_order || 0));
      newSortOrder = activeOrders.length ? Math.max(...activeOrders) + 1 : 0;
    }

    const patch = next && isBatting
      ? { is_playing: next, sort_order: newSortOrder }
      : { is_playing: next };

    const { error } = await supabase.from("game_roster").update(patch).eq("game_id", player.game_id).eq("player_id", player.player_id);
    if (error) { setErr(error.message); return; }

    const apply = (arr) => arr.map((p) => (p.player_id === player.player_id ? { ...p, is_playing: next, sort_order: newSortOrder } : p));
    if (side === "A") setRosterA((r) => apply(r));
    else setRosterB((r) => apply(r));
  }

  async function moveInOrder(player, dir) {
    if (!isBattingSport(game?.sport)) return;
    setErr("");
    const side = player.team_side;
    const list = side === "A" ? rosterA : rosterB;
    const idx = list.findIndex((p) => p.player_id === player.player_id);
    if (idx < 0) return;
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= list.length) return;
    const a = list[idx]; const b = list[j];
    const { error: e1 } = await supabase.from("game_roster").update({ sort_order: b.sort_order }).eq("game_id", a.game_id).eq("player_id", a.player_id);
    if (e1) { setErr(e1.message); return; }
    const { error: e2 } = await supabase.from("game_roster").update({ sort_order: a.sort_order }).eq("game_id", b.game_id).eq("player_id", b.player_id);
    if (e2) { setErr(e2.message); return; }
    const next = [...list];
    next[idx] = { ...a, sort_order: b.sort_order };
    next[j] = { ...b, sort_order: a.sort_order };
    next.sort((x, y) => Number(x.sort_order || 0) - Number(y.sort_order || 0));
    if (side === "A") setRosterA(next);
    else setRosterB(next);
  }

  async function endSet() {
    if (!game || actionBusy) return;
    setErr("");

    const sa = Number(game.score_a || 0);
    const sb = Number(game.score_b || 0);

    if (sa === sb) {
      setErr("Set is tied. A set must have a winner before ending it.");
      return;
    }

    setActionBusy(true);
    try {
      const newSeriesA = sa > sb ? seriesA + 1 : seriesA;
      const newSeriesB = sb > sa ? seriesB + 1 : seriesB;

      const notes = stringifySeriesNotes(seriesFormat, newSeriesA, newSeriesB);

      const { data, error } = await supabase
        .from("live_games")
        .update({
          score_a: 0,
          score_b: 0,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", game.id)
        .select("*")
        .single();

      if (error) { setErr(error.message); return; }

      setGame(data);
      setSeriesA(newSeriesA);
      setSeriesB(newSeriesB);
    } finally {
      setActionBusy(false);
    }
  }

  async function finalizeGame() {
    if (!game || finalizing) return;
    setErr("");

    const isVB = isSeriesSport(game.sport);

    if (isVB) {
      // For volleyball, the official score is the SERIES score, not the
      // leftover set score. Write the series into score_a/score_b first.
      const majority = Math.floor(seriesFormat / 2) + 1;
      if (seriesA < majority && seriesB < majority) {
        setErr(`Series isn't decided yet. Need ${majority} set wins to finalize (currently ${seriesA}-${seriesB}).`);
        return;
      }
      if (seriesA === seriesB) {
        setErr("Series is tied. Bauercrest has no ties — end another set before finalizing.");
        return;
      }

      setFinalizing(true);
      try {
        const g2 = await updateLiveGame({ score_a: seriesA, score_b: seriesB });
        if (!g2) { setFinalizing(false); return; }

        const { error } = await supabase.rpc("finalize_game", { gid: game.id });
        if (error) { setErr(error.message); setFinalizing(false); return; }
        await refreshGame();
        router.push("/");
      } catch (e) {
        setErr(e?.message ?? String(e));
        setFinalizing(false);
      }
      return;
    }

    if (rules?.clock?.enabled && derived.isRunning) { setErr("Pause the clock before finalizing."); return; }
    const sa = Number(game.score_a || 0); const sb = Number(game.score_b || 0);
    if (sa === 0 && sb === 0) { setErr("Score is 0-0. Add points before finalizing."); return; }
    if (sa === sb) { setErr("Score is tied. Bauercrest has no ties — adjust the score before finalizing."); return; }

    setFinalizing(true);
    try {
      if (rules?.clock?.enabled) {
        const rem = Math.floor(derived.remaining);
        const g2 = await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: rem, timer_remaining_seconds: rem });
        if (!g2) { setFinalizing(false); return; }
      }
      const { error } = await supabase.rpc("finalize_game", { gid: game.id });
      if (error) { setErr(error.message); setFinalizing(false); return; }
      await refreshGame();
      router.push("/");
    } catch (e) {
      setErr(e?.message ?? String(e));
      setFinalizing(false);
    }
  }

  // ── Early returns ──────────────────────────────────────────────────────────
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0a1628] text-white text-lg font-bold">Loading…</div>;
  if (!game) return <div className="flex min-h-screen items-center justify-center bg-[#0a1628] text-red-300 text-lg font-bold p-6">{err || "Game not found."}</div>;

  // ── Derived display values ─────────────────────────────────────────────────
  const leftLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_a1, game.team_a2) : norm(game.team_a1);
  const rightLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_b1, game.team_b2) : norm(game.team_b1);
  const scoreA = Number(game.score_a || 0);
  const scoreB = Number(game.score_b || 0);

  function getVal(pid, statKey) { return Number(statTotals[`${pid}:${norm(statKey)}`] || 0); }

  const playingA = rosterA.filter((p) => p.is_playing);
  const benchA = rosterA.filter((p) => !p.is_playing);
  const playingB = rosterB.filter((p) => p.is_playing);
  const benchB = rosterB.filter((p) => !p.is_playing);

  const scoreButtons = rules?.scoreButtons?.length ? rules.scoreButtons : [1];
  const statDefs = rules?.stats ?? [];
  const isHoop = norm(game.sport) === "hoop";
  const clockPresets = activeClockMode?.presets ?? [300, 600, 900, 1200, 1800];
  const chipPad = superCompact ? "px-2 py-1" : "px-3 py-2";
  const chipText = superCompact ? "text-[11px]" : "text-sm";

  // ── Sub-components ─────────────────────────────────────────────────────────
  function StatChip({ p, sd, side }) {
    const deltas = sd?.deltas?.length ? sd.deltas : [1];
    const v = getVal(p.player_id, sd.key);

    const isAutoScoreGoal = sd.key === "g" && GOAL_AUTO_SCORE_SPORTS.includes(norm(game?.sport));
    const handleBump = (d) => (isAutoScoreGoal ? bumpGoalWithScore(p, side, d) : bumpStat(p, sd.key, d));
    const handleUndo = () => (isAutoScoreGoal ? undoGoalWithScore(p, side) : undoStat(p, sd.key));

    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-white/50">{sd.label}</span>
        <span className="min-w-[18px] text-center text-sm font-black tabular-nums text-white">{v}</span>
        <button onClick={handleUndo} disabled={v <= 0}
          className={`rounded border border-red-500/30 bg-red-500/10 ${chipPad} ${chipText} font-black text-red-300 active:scale-95 disabled:opacity-20`}>
          -1
        </button>
        {deltas.map((d) => (
          <button key={`${p.player_id}-${sd.key}-${d}`} onClick={() => handleBump(d)}
            className={`rounded border border-white/10 bg-white/10 ${chipPad} ${chipText} font-black active:scale-95`}>
            +{d}
          </button>
        ))}
      </div>
    );
  }

  function PlayerRow({ p, sideLabel, idx, total, side }) {
    const showBatting = isBattingSport(game?.sport);
    const isCap = captainIds instanceof Set ? captainIds.has(String(p.player_id)) : false;
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
        <div className="flex items-center justify-between gap-2">
          {showBatting ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="w-5 text-center text-[10px] font-black opacity-60">{idx + 1}</span>
              <button onClick={() => moveInOrder(p, "up")} disabled={idx === 0} className="rounded border border-white/10 bg-white/10 px-1.5 py-1 text-[10px] font-black disabled:opacity-30">↑</button>
              <button onClick={() => moveInOrder(p, "down")} disabled={idx === total - 1} className="rounded border border-white/10 bg-white/10 px-1.5 py-1 text-[10px] font-black disabled:opacity-30">↓</button>
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-white">{isCap ? "⭐ " : ""}{p.player_name || p.player_id}</div>
          </div>
          <button onClick={() => togglePlaying(p)}
            className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-black text-red-300 active:scale-95">
            Out
          </button>
        </div>
        {statDefs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {statDefs.map((sd) => <StatChip key={`${p.player_id}-${sd.key}`} p={p} sd={sd} side={side} />)}
          </div>
        )}
      </div>
    );
  }

  function hoopShortName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/);
    if (parts.length < 2) return fullName || "";
    const first = parts[0];
    const last = parts.slice(1).join(" ");
    return `${first.charAt(0)}. ${last}`;
  }

  function HoopPlayerRow({ p, side }) {
    const isCap = captainIds instanceof Set ? captainIds.has(String(p.player_id)) : false;
    const pts = getVal(p.player_id, "pts");
    const fouls = getVal(p.player_id, "foul");
    const shortName = hoopShortName(p.player_name || p.player_id);
    return (
      <div className="flex items-end gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
        <div className="min-w-0 flex-1 self-center">
          <div className="truncate text-[13px] font-black text-white">{isCap ? "⭐ " : ""}{shortName}</div>
        </div>

        <div className="flex flex-col items-center shrink-0">
          <span className="text-[8px] font-black uppercase leading-tight text-white/40">PTS · {pts}</span>
          <div className="mt-0.5 flex items-center gap-1">
            <button onClick={() => undoHoopPoints(p, side)} disabled={pts <= 0}
              className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-1 text-[10px] font-black text-red-300 active:scale-95 disabled:opacity-20">-1</button>
            {[1, 2, 3].map((d) => (
              <button key={d} onClick={() => bumpHoopPoints(p, side, d)}
                className="rounded border border-white/15 bg-white/10 px-1.5 py-1 text-[10px] font-black active:scale-95">+{d}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center shrink-0 border-l border-white/10 pl-1.5">
          <span className="text-[8px] font-black uppercase leading-tight text-white/40">F · {fouls}</span>
          <div className="mt-0.5 flex items-center gap-1">
            <button onClick={() => undoStat(p, "foul")} disabled={fouls <= 0}
              className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-1 text-[10px] font-black text-red-300 active:scale-95 disabled:opacity-20">-1</button>
            <button onClick={() => bumpStat(p, "foul", 1)}
              className="rounded border border-white/15 bg-white/10 px-1.5 py-1 text-[10px] font-black active:scale-95">+1</button>
          </div>
        </div>

        <button onClick={() => togglePlaying(p)}
          className="shrink-0 self-center rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] font-black text-red-300 active:scale-95">
          Out
        </button>
      </div>
    );
  }
  
  function BenchRow({ p, sideLabel }) {
    const isCap = captainIds instanceof Set ? captainIds.has(String(p.player_id)) : false;
    return (
      <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
        <span className="truncate text-xs font-semibold text-white/70">{isCap ? "⭐ " : ""}{p.player_name || p.player_id}</span>
        <button onClick={() => togglePlaying(p)}
          className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-black text-emerald-300 active:scale-95">
          In
        </button>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-[#0a1628] text-white">

      {/* WiFi warning */}
      {!isOnline ? (
        <div className="sticky top-0 z-50 bg-red-600 px-4 py-2.5 text-center text-sm font-black text-white">
          ⚠️ NO WIFI — Scores are NOT saving. Reconnect before continuing.
        </div>
      ) : null}

      {/* Error */}
      {err ? (
        <div className="px-3 pt-2">
          <div className="rounded-lg border border-red-700 bg-red-950/50 px-3 py-2 text-xs font-bold text-red-200">{err}</div>
        </div>
      ) : null}

      {/* ── TOP BAR (collapsible) ── */}
      {showTopBar ? (
        <div className="flex items-center justify-between border-b border-white/10 bg-[#06101f] px-3 py-2">
          <div className="min-w-0 truncate text-[11px] font-bold uppercase tracking-widest text-white/40">
            {game.league_key} · {game.sport} · {game.level} · {game.mode}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSuperCompact((v) => !v)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-white/60 hover:bg-white/10">
              {superCompact ? "Compact" : "Large"}
            </button>
            <button onClick={() => router.push("/")}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-white/60 hover:bg-white/10">
              Home
            </button>
            <button onClick={() => setShowTopBar(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-bold text-white/60 hover:bg-white/10">
              ▲
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowTopBar(true)}
          className="flex w-full items-center justify-center border-b border-white/10 bg-[#06101f] py-1 text-white/30 hover:text-white/60">
          <span className="text-[10px] leading-none">☰</span>
        </button>
      )}

      {/* ── SCOREBOARD ── */}
      <div className="border-b border-white/10 bg-[#07112a] px-3 py-2">
        {isHoop ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex items-center gap-3 text-left">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">{leftLabel}</div>
                <div className="text-2xl font-black tabular-nums text-white">{scoreA}</div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              {rules?.clock?.enabled ? (
                <>
                  <button onClick={openSetTimeModal}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xl font-black tabular-nums text-white active:scale-[0.98]">
                    {fmtClock(derived.remaining)}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {game.timer_running ? (
                      <button onClick={onPause} className="rounded-lg bg-white px-4 py-2 text-xs font-black text-black active:scale-95">Pause</button>
                    ) : (
                      <button onClick={onStart} className="rounded-lg bg-white px-4 py-2 text-xs font-black text-black active:scale-95">Start</button>
                    )}
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

            <div className="flex items-center justify-end gap-3 text-right">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">{rightLabel}</div>
                <div className="text-2xl font-black tabular-nums text-white">{scoreB}</div>
              </div>
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">

          {/* Team A */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/60">Home</div>
            <div className="mt-0.5 truncate text-base font-black text-white">{leftLabel}</div>
            <div className="mt-1 text-5xl font-black tabular-nums text-white">{scoreA}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => undoScore("A")} disabled={scoreA <= 0}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20">
                -1
              </button>
              {scoreButtons.map((d) => (
                <button key={`A-${d}`} onClick={() => bumpScore("A", d)}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-black active:scale-95">
                  +{d}
                </button>
              ))}
            </div>
          </div>

          {/* Clock center column */}
          <div className="flex flex-col items-center gap-1 px-2">
            {rules?.clock?.enabled ? (
              <>
                <button onClick={openSetTimeModal}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-3xl font-black tabular-nums text-white active:scale-[0.98]">
                  {fmtClock(derived.remaining)}
                </button>

                <div className="flex items-center gap-1.5">
                  {game.timer_running ? (
                    <button onClick={onPause}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black active:scale-95">
                      Pause
                    </button>
                  ) : (
                    <button onClick={onStart}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black active:scale-95">
                      Start
                    </button>
                  )}
                  <button onClick={() => onReset(game.duration_seconds || clockPresets[clockPresets.length - 1] || 1800)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black active:scale-95">
                    Reset
                  </button>
                </div>

                {/* Clock presets — scrollable row */}
                <div className="flex gap-1 overflow-x-auto pb-0.5 max-w-[120px]">
                  {clockPresets.map((s) => (
                    <button key={`preset-${s}`} onClick={() => onReset(s)}
                      className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] font-bold active:scale-95">
                      {fmtClock(s)}
                    </button>
                  ))}
                </div>

                {rules?.clock?.modes?.length > 1 ? (
                  <select value={clockMode} onChange={(e) => setClockMode(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#0a1628] px-2 py-1 text-[10px] font-bold text-white outline-none">
                    {rules.clock.modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">No Clock</div>
              </div>
            )}

            {/* Series tracker — Volleyball and Newcomb */}
            {isSeriesSport(game.sport) ? (
              <div className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Series (Bo{seriesFormat})</div>
                <div className="text-2xl font-black tabular-nums text-white">{seriesA} - {seriesB}</div>
                <button
                  onClick={endSet}
                  disabled={actionBusy || (Number(game.score_a || 0) === Number(game.score_b || 0))}
                  className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-200 active:scale-95 disabled:opacity-30"
                >
                  End Set
                </button>
              </div>
            ) : null}

            {/* Innings counter — softball and kickball only */}
            {(norm(game.sport) === "softball" || norm(game.sport) === "kickball") ? (
              <div className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Inning</div>
                <div className="text-2xl font-black tabular-nums text-white">{inning}</div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setInning((v) => Math.max(1, v - 1))}
                    disabled={inning <= 1}
                    className="rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-sm font-black active:scale-95 disabled:opacity-20"
                  >
                    -1
                  </button>
                  <button
                    onClick={() => setInning((v) => v + 1)}
                    className="rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-sm font-black active:scale-95"
                  >
                    +1
                  </button>
                </div>
              </div>
            ) : null}

            {/* Finalize */}
            <button onClick={() => setConfirmFinalizeOpen(true)}
              className="mt-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-200 active:scale-95 hover:bg-emerald-500/20">
              Finalize
            </button>
          </div>

          {/* Team B */}
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/60">Away</div>
            <div className="mt-0.5 truncate text-base font-black text-white">{rightLabel}</div>
            <div className="mt-1 text-5xl font-black tabular-nums text-white">{scoreB}</div>
            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
              {scoreButtons.map((d) => (
                <button key={`B-${d}`} onClick={() => bumpScore("B", d)}
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-black active:scale-95">
                  +{d}
                </button>
              ))}
              <button onClick={() => undoScore("B")} disabled={scoreB <= 0}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20">
                -1
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ── ROSTERS ── */}
      <div className="grid grid-cols-2 gap-2 p-3">

        {/* Team A roster */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-white/60">{leftLabel}</div>
            <button onClick={() => setShowBenchA((v) => !v)}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/50 hover:bg-white/10">
              {showBenchA ? "Bench ▲" : `Bench (${benchA.length}) ▼`}
            </button>
          </div>

          <div className="space-y-1.5">
            {playingA.length ? (
              playingA.map((p) => {
                const idx = rosterA.findIndex((x) => x.player_id === p.player_id);
                return isHoop
                  ? <HoopPlayerRow key={p.player_id} p={p} side="A" />
                  : <PlayerRow key={p.player_id} p={p} sideLabel="A" idx={Math.max(0, idx)} total={rosterA.length} side="A" />;
              })
            ) : (
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px] text-white/40">
                No one in yet — open bench + tap In
              </div>
            )}
          </div>

          {showBenchA ? (
            <div className="mt-2 space-y-1">
              {benchA.length ? (
                benchA.map((p) => <BenchRow key={p.player_id} p={p} sideLabel="A" />)
              ) : (
                <div className="text-[10px] text-white/30">No bench.</div>
              )}
            </div>
          ) : null}
        </div>

        {/* Team B roster */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-white/60">{rightLabel}</div>
            <button onClick={() => setShowBenchB((v) => !v)}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/50 hover:bg-white/10">
              {showBenchB ? "Bench ▲" : `Bench (${benchB.length}) ▼`}
            </button>
          </div>

          <div className="space-y-1.5">
            {playingB.length ? (
              playingB.map((p) => {
                const idx = rosterB.findIndex((x) => x.player_id === p.player_id);
                return isHoop
                  ? <HoopPlayerRow key={p.player_id} p={p} side="B" />
                  : <PlayerRow key={p.player_id} p={p} sideLabel="B" idx={Math.max(0, idx)} total={rosterB.length} side="B" />;
              })
            ) : (
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px] text-white/40">
                No one in yet — open bench + tap In
              </div>
            )}
          </div>

          {showBenchB ? (
            <div className="mt-2 space-y-1">
              {benchB.length ? (
                benchB.map((p) => <BenchRow key={p.player_id} p={p} sideLabel="B" />)
              ) : (
                <div className="text-[10px] text-white/30">No bench.</div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-3 pb-8 text-[10px] text-white/20">ID: {String(game.id)}</div>

      {/* ── SET TIME MODAL ── */}
      {setTimeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#08172c] p-5">
            <div className="text-lg font-black">Set Clock Time</div>
            <div className="mt-1 text-sm text-white/60">Enter time as mm:ss. Clock will stay paused.</div>
            <input value={timeInput} onChange={(e) => setTimeInput(formatMMSSFromDigits(e.target.value))}
              inputMode="numeric" placeholder="mm:ss"
              className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-3xl font-black tracking-widest text-white outline-none focus:border-white/30" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setSetTimeOpen(false)}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold">
                Cancel
              </button>
              <button className="flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-black"
                onClick={async () => {
                  const seconds = parseMMSS(timeInput);
                  if (seconds === null) { setErr("Time must be in mm:ss format (example: 11:05)."); return; }
                  setSetTimeOpen(false);
                  await setExactRemaining(seconds);
                  await refreshGame();
                }}>
                Set Time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FINALIZE MODAL ── */}
      {confirmFinalizeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#08172c] p-5">
            <div className="text-lg font-black">Finalize this game?</div>
            <div className="mt-2 text-sm text-white/60">Locks the score and updates standings + stat leaders.</div>

            {rules?.clock?.enabled && derived.isRunning ? (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">Pause the clock before finalizing.</div>
            ) : null}

            {(() => {
              if (isSeriesSport(game?.sport)) {
                const majority = Math.floor(seriesFormat / 2) + 1;
                if (seriesA < majority && seriesB < majority) {
                  return <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">⚠️ Series isn't decided yet. Need {majority} set wins (currently {seriesA}-{seriesB}).</div>;
                }
                if (seriesA === seriesB) {
                  return <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">⚠️ Series is tied ({seriesA}-{seriesB}). End another set before finalizing.</div>;
                }
                return (
                  <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    Series is {seriesA}-{seriesB}. This will be recorded as the final score.
                  </div>
                );
              }

              const sa = Number(game?.score_a || 0);
              const sb = Number(game?.score_b || 0);
              if (sa === 0 && sb === 0) return <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">⚠️ Score is 0-0. Add points before finalizing.</div>;
              if (sa === sb) return <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">⚠️ Score is tied ({sa}-{sb}). Bauercrest has no ties — adjust before finalizing.</div>;
              return null;
            })()}

            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmFinalizeOpen(false)}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold">
                Cancel
              </button>
              <button disabled={(rules?.clock?.enabled && derived.isRunning) || finalizing}
                className="flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-black disabled:opacity-40"
                onClick={async () => { await finalizeGame(); }}>
                {finalizing ? "Finalizing…" : "Finalize"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}