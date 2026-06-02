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

// Captains are season-long: stored on players.role (not per-game)
async function fetchCaptainIds({ leagueId, teamNames }) {
  if (!leagueId || !teamNames?.length) return new Set();

  const { data, error } = await supabase
    .from("players")
    .select("id, role, team_name")
    .eq("league_id", leagueId)
    .in("team_name", teamNames);

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
  const [clockMode, setClockMode] = useState("");

  const [showBenchA, setShowBenchA] = useState(true);
  const [showBenchB, setShowBenchB] = useState(true);

  const [superCompact, setSuperCompact] = useState(true);

  const [setTimeOpen, setSetTimeOpen] = useState(false);
  const [timeInput, setTimeInput] = useState("00:00");

  const [captainIds, setCaptainIds] = useState(new Set());

  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
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
    if (!quiet) {
      setErr("");
      setLoading(true);
    } else {
      setErr("");
    }

    try {
      const { data, error } = await supabase.from("live_games").select("*").eq("id", gameId).single();
      if (error) throw error;
      setGame(data);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function refreshGame() {
    await loadGame({ quiet: true });
  }

  async function backfillSortOrder(gameId2, rows) {
    try {
      const bySide = { A: [], B: [] };
      for (const r of rows || []) {
        const s = r.team_side === "A" ? "A" : "B";
        bySide[s].push(r);
      }
      for (const side of ["A", "B"]) {
        const list = bySide[side]
          .slice()
          .sort((x, y) => String(x.player_name || "").localeCompare(String(y.player_name || "")));
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          await supabase
            .from("game_roster")
            .update({ sort_order: i })
            .eq("game_id", gameId2)
            .eq("player_id", r.player_id);
        }
      }
    } catch {
      // not fatal
    }
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

    if (rErr) {
      setErr(rErr.message);
      return;
    }

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
          setRosterA(a0);
          setRosterB(b0);

          if (a0.filter((p) => p.is_playing).length === 0) setShowBenchA(true);
          if (b0.filter((p) => p.is_playing).length === 0) setShowBenchB(true);
          return;
        }
      }

      const a = r1.filter((x) => x.team_side === "A");
      const b = r1.filter((x) => x.team_side === "B");
      setRosterA(a);
      setRosterB(b);

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

    if (!lk || !allTeams.length) {
      setErr("Missing league/team info for this game.");
      return;
    }

    const { data: players, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, team_name, league_id")
      .eq("league_id", lk)
      .in("team_name", allTeams)
      .limit(5000);

    if (pErr) {
      setErr(pErr.message);
      return;
    }

    const orderA = { v: 0 };
    const orderB = { v: 0 };

    const rows = (players || []).map((p) => {
      const tn = norm(p.team_name);
      const side = teamsA.includes(tn) ? "A" : "B";
      const so = side === "A" ? orderA.v++ : orderB.v++;
      return {
        game_id: g.id,
        player_id: String(p.id),
        player_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        team_side: side,
        team_name: tn,
        is_playing: false,
        sort_order: so,
      };
    });

    if (rows.length) {
      const chunk = 250;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error: insErr } = await supabase.from("game_roster").insert(rows.slice(i, i + chunk));
        if (insErr) {
          setErr(insErr.message);
          return;
        }
      }
    }

    const { data: r2, error: r2Err } = await supabase
      .from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", g.id)
      .order("team_side", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(5000);

    if (r2Err) {
      setErr(r2Err.message);
      return;
    }

    const a = (r2 || []).filter((x) => x.team_side === "A");
    const b = (r2 || []).filter((x) => x.team_side === "B");
    setRosterA(a);
    setRosterB(b);

    setShowBenchA(true);
    setShowBenchB(true);
  }

  async function loadEventTotals(g) {
    setErr("");

    const { data, error } = await supabase
      .from("live_events")
      .select("player_id, stat_key, delta, event_type, game_id")
      .eq("game_id", g.id)
      .eq("event_type", "stat")
      .limit(10000);

    if (error) {
      setErr(error.message);
      return;
    }

    const totals = {};
    for (const row of data || []) {
      const key = `${row.player_id}:${row.stat_key}`;
      totals[key] = (totals[key] || 0) + Number(row.delta || 0);
    }
    setStatTotals(totals);
  }

  async function refreshStats() {
    if (!game) return;
    await loadEventTotals(game);
  }

  useEffect(() => {
    if (!gameId) return;
    (async () => {
      await loadGame();
    })();
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
      } catch (e) {
        // ignore
      }
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

    if (error) {
      setErr(error.message);
      return null;
    }
    setGame(data);
    return data;
  }

  async function onStart() {
    if (!game) return;
    const rem = derived.remaining;
    const nowSec = Date.now() / 1000;

    await updateLiveGame({
      timer_running: true,
      timer_anchor_ts: nowSec,
      timer_remaining_at_anchor: Math.floor(rem),
      timer_remaining_seconds: Math.floor(rem),
    });
  }

  async function onPause() {
    if (!game) return;
    const rem = derived.remaining;

    await updateLiveGame({
      timer_running: false,
      timer_anchor_ts: null,
      timer_remaining_at_anchor: Math.floor(rem),
      timer_remaining_seconds: Math.floor(rem),
    });
  }

  async function onReset(seconds) {
    if (!game) return;
    const s = Math.max(0, Math.floor(Number(seconds)));

    await updateLiveGame({
      timer_running: false,
      timer_anchor_ts: null,
      duration_seconds: s,
      timer_remaining_at_anchor: s,
      timer_remaining_seconds: s,
    });
  }

  async function setExactRemaining(seconds) {
    if (!game) return;
    const s = Math.max(0, Math.floor(Number(seconds)));

    await updateLiveGame({
      timer_running: false,
      timer_anchor_ts: null,
      timer_remaining_at_anchor: s,
      timer_remaining_seconds: s,
    });
  }

  async function openSetTimeModal() {
    if (!rules?.clock?.enabled) return;

    if (derived.isRunning) {
      await onPause();
    }

    setTimeInput(fmtClock(derived.remaining));
    setSetTimeOpen(true);
  }

  async function bumpScore(side, delta) {
    if (!game) return;
    setErr("");

    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;

    const { error } = await supabase.rpc("rpc_add_score", {
      p_game_id: game.id,
      p_side: side,
      p_delta: d,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    await refreshGame();
  }
async function undoScore(side) {
    if (!game) return;
    setErr("");

    const current = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
    if (current <= 0) return;

    const { error } = await supabase.rpc("rpc_add_score", {
      p_game_id: game.id,
      p_side: side,
      p_delta: -1,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    await refreshGame();
  }

  async function undoStat(player, statKey) {
    if (!game) return;
    setErr("");

    const current = getVal(player.player_id, statKey);
    if (current <= 0) return;

    const leagueId = norm(game.league_key);
    const sport = norm(game.sport);

    const { error } = await supabase.rpc("rpc_add_stat", {
      p_game_id: game.id,
      p_league_id: leagueId,
      p_sport: sport,
      p_player_id: String(player.player_id),
      p_player_name: String(player.player_name || player.player_id),
      p_team_name: String(player?.team_name || ""),
      p_stat_key: norm(statKey),
      p_delta: -1,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    await refreshStats();
  }
  async function bumpStat(player, statKey, delta) {
    if (!game) return;
    setErr("");

    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;

    const leagueId = norm(game.league_key);
    const sport = norm(game.sport);
    const teamName = String(player?.team_name || "");

    const { error } = await supabase.rpc("rpc_add_stat", {
      p_game_id: game.id,
      p_league_id: leagueId,
      p_sport: sport,
      p_player_id: String(player.player_id),
      p_player_name: String(player.player_name || player.player_id),
      p_team_name: teamName,
      p_stat_key: norm(statKey),
      p_delta: d,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    await refreshStats();
  }

  async function togglePlaying(player) {
    setErr("");
    const next = !player.is_playing;

    const { error } = await supabase
      .from("game_roster")
      .update({ is_playing: next })
      .eq("game_id", player.game_id)
      .eq("player_id", player.player_id);

    if (error) {
      setErr(error.message);
      return;
    }

    const apply = (arr) =>
      arr.map((p) => (p.player_id === player.player_id ? { ...p, is_playing: next } : p));

    if (player.team_side === "A") setRosterA((r) => apply(r));
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

    const a = list[idx];
    const b = list[j];

    const { error: e1 } = await supabase
      .from("game_roster")
      .update({ sort_order: b.sort_order })
      .eq("game_id", a.game_id)
      .eq("player_id", a.player_id);
    if (e1) {
      setErr(e1.message);
      return;
    }

    const { error: e2 } = await supabase
      .from("game_roster")
      .update({ sort_order: a.sort_order })
      .eq("game_id", b.game_id)
      .eq("player_id", b.player_id);
    if (e2) {
      setErr(e2.message);
      return;
    }

    const next = [...list];
    next[idx] = { ...a, sort_order: b.sort_order };
    next[j] = { ...b, sort_order: a.sort_order };
    next.sort((x, y) => Number(x.sort_order || 0) - Number(y.sort_order || 0));
    if (side === "A") setRosterA(next);
    else setRosterB(next);
  }

  async function finalizeGame() {
    if (!game) return;
    setErr("");

    if (rules?.clock?.enabled && derived.isRunning) {
      setErr("Pause the clock before finalizing.");
      return;
    }

    const sa = Number(game.score_a || 0);
    const sb = Number(game.score_b || 0);

    if (sa === 0 && sb === 0) {
      setErr("Score is 0-0. Add points before finalizing.");
      return;
    }

    if (sa === sb) {
      setErr("Score is tied. Bauercrest has no ties — adjust the score before finalizing.");
      return;
    }

    if (rules?.clock?.enabled) {
      const rem = Math.floor(derived.remaining);
      const g2 = await updateLiveGame({
        timer_running: false,
        timer_anchor_ts: null,
        timer_remaining_at_anchor: rem,
        timer_remaining_seconds: rem,
      });
      if (!g2) return;
    }

    const { error } = await supabase.rpc("finalize_game", { gid: game.id });
    if (error) {
      setErr(error.message);
      return;
    }

    await refreshGame();
    router.push("/");
  }

  if (loading) return <div className="p-6 text-white">Loading…</div>;
  if (!game) return <div className="p-6 text-red-200">{err || "Game not found."}</div>;

  const header = `${game.league_key} • ${game.sport} • Level ${game.level} • ${game.mode}`;

  const leftLabel =
    game.matchup_type === "two_team"
      ? matchupLabel(game.team_a1, game.team_a2)
      : norm(game.team_a1);
  const rightLabel =
    game.matchup_type === "two_team"
      ? matchupLabel(game.team_b1, game.team_b2)
      : norm(game.team_b1);

  const scoreA = Number(game.score_a || 0);
  const scoreB = Number(game.score_b || 0);

  function getVal(pid, statKey) {
    return Number(statTotals[`${pid}:${norm(statKey)}`] || 0);
  }

  const playingA = rosterA.filter((p) => p.is_playing);
  const benchA = rosterA.filter((p) => !p.is_playing);
  const playingB = rosterB.filter((p) => p.is_playing);
  const benchB = rosterB.filter((p) => !p.is_playing);

  const scoreButtons = rules?.scoreButtons?.length ? rules.scoreButtons : [1];
  const statDefs = rules?.stats?.length ? rules.stats : [{ key: "pts", label: "PTS", deltas: [1] }];

  const clockPresets = activeClockMode?.presets ?? [300, 600, 900, 1200, 1800];

  const chipPad = superCompact ? "px-2 py-1" : "px-3 py-2";
  const chipText = superCompact ? "text-[11px]" : "text-sm";

  function StatChip({ p, sd }) {
    const deltas = sd?.deltas?.length ? sd.deltas : [1];
    const v = getVal(p.player_id, sd.key);

    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-black opacity-80">{sd.label}</div>
          <div className="min-w-[24px] text-right text-sm font-black tabular-nums">{v}</div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => undoStat(p, sd.key)}
            disabled={v <= 0}
            className={`rounded-lg border border-red-500/30 bg-red-500/10 ${chipPad} ${chipText} font-extrabold text-red-300 active:scale-95 disabled:opacity-30`}
          >
            -1
          </button>
          {deltas.map((d) => (
            <button
              key={`${p.player_id}-${sd.key}-${d}`}
              onClick={() => bumpStat(p, sd.key, d)}
              className={`rounded-lg border border-white/10 bg-white/10 ${chipPad} ${chipText} font-extrabold active:scale-95`}
            >
              +{d}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function PlayerRow({ p, sideLabel, idx, total }) {
    const showBatting = isBattingSport(game?.sport);
    const isCap = captainIds instanceof Set ? captainIds.has(String(p.player_id)) : false;

    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          {showBatting ? (
            <div className="mr-2 flex shrink-0 items-center gap-1">
              <div className="w-6 text-center text-xs font-black opacity-70">{idx + 1}</div>
              <button
                onClick={() => moveInOrder(p, "up")}
                disabled={idx === 0}
                className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs font-black disabled:opacity-40"
                title="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => moveInOrder(p, "down")}
                disabled={idx === total - 1}
                className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs font-black disabled:opacity-40"
                title="Move down"
              >
                ↓
              </button>
            </div>
          ) : null}

          <div className="min-w-0">
            <div className="truncate text-base font-extrabold">
              {isCap ? "⭐ " : ""}
              {p.player_name || p.player_id}
            </div>
            {p.team_name ? <div className="mt-0.5 text-xs text-white/50">Team: {p.team_name}</div> : null}
          </div>

          <button
            onClick={() => togglePlaying(p)}
            className="shrink-0 rounded-xl border border-red-800 bg-red-950/40 px-3 py-2 text-xs font-extrabold text-red-200 active:scale-95"
            title={`Remove from playing (${sideLabel})`}
          >
            Remove
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {statDefs.map((sd) => (
            <StatChip key={`${p.player_id}-${sd.key}`} p={p} sd={sd} />
          ))}
        </div>
      </div>
    );
  }

  function BenchRow({ p, sideLabel }) {
    const isCap = captainIds instanceof Set ? captainIds.has(String(p.player_id)) : false;

    return (
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 p-3">
        <div className="min-w-0">
          <div className="truncate font-semibold opacity-90">
            {isCap ? "⭐ " : ""}
            {p.player_name || p.player_id}
          </div>
          {p.team_name ? <div className="mt-0.5 text-xs text-white/50">{p.team_name}</div> : null}
        </div>
        <button
          onClick={() => togglePlaying(p)}
          className="shrink-0 rounded-xl border border-emerald-700 bg-emerald-950/30 px-3 py-2 text-xs font-extrabold text-emerald-200 active:scale-95"
          title={`Add to playing (${sideLabel})`}
        >
          Add
        </button>
      </div>
    );
  }

  function ScoreboardPanel({ desktop = false }) {
    return (
      <div className={`rounded-2xl border border-white/10 bg-[#08172c]/85 p-4 backdrop-blur ${desktop ? "hidden md:block" : "md:hidden"}`}>
        <div className={`grid gap-3 ${desktop ? "grid-cols-2" : "grid-cols-2"}`}>
          <div>
            <div className="text-[10px] tracking-widest opacity-70">HOME</div>
            <div className={`${desktop ? "mt-2 text-2xl" : "mt-1 text-lg"} truncate font-extrabold`}>{leftLabel}</div>
            <div className={`${desktop ? "mt-2 text-6xl" : "mt-1 text-4xl"} font-black tabular-nums`}>{scoreA}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {scoreButtons.map((d) => (
                <button
                  key={`${desktop ? "d" : "m"}A-${d}`}
                  onClick={() => bumpScore("A", d)}
                  className={`${desktop ? "px-4 py-3 text-lg" : "px-3 py-2 text-base"} rounded-xl border border-white/10 bg-white/10 font-extrabold active:scale-95`}
                >
                  +{d}
                </button>
              ))}
              <button
                onClick={() => undoScore("A")}
                disabled={scoreA <= 0}
                className={`${desktop ? "px-4 py-3 text-lg" : "px-3 py-2 text-base"} rounded-xl border border-red-500/30 bg-red-500/10 font-extrabold text-red-300 active:scale-95 disabled:opacity-30`}
              >
                -1
              </button>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] tracking-widest opacity-70">AWAY</div>
            <div className={`${desktop ? "mt-2 text-2xl" : "mt-1 text-lg"} truncate font-extrabold`}>{rightLabel}</div>
            <div className={`${desktop ? "mt-2 text-6xl" : "mt-1 text-4xl"} font-black tabular-nums`}>{scoreB}</div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => undoScore("B")}
                disabled={scoreB <= 0}
                className={`${desktop ? "px-4 py-3 text-lg" : "px-3 py-2 text-base"} rounded-xl border border-red-500/30 bg-red-500/10 font-extrabold text-red-300 active:scale-95 disabled:opacity-30`}
              >
                -1
              </button>
              {scoreButtons.map((d) => (
                <button
                  key={`${desktop ? "d" : "m"}B-${d}`}
                  onClick={() => bumpScore("B", d)}
                  className={`${desktop ? "px-4 py-3 text-lg" : "px-3 py-2 text-base"} rounded-xl border border-white/10 bg-white/10 font-extrabold active:scale-95`}
                >
                  +{d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] tracking-widest opacity-70">
            {rules?.clock?.enabled ? "GAME CLOCK" : "NO CLOCK"}
          </div>

          {rules?.clock?.enabled ? (
            <>
              <button
                type="button"
                onClick={openSetTimeModal}
                className={`mt-2 w-full rounded-xl border border-white/10 bg-white/5 py-3 text-center ${desktop ? "text-6xl" : "text-5xl"} font-black tabular-nums active:scale-[0.99]`}
                title="Tap to set exact time (mm:ss)"
              >
                {fmtClock(derived.remaining)}
              </button>
              <div className="mt-1 text-center text-xs text-white/60">Tap clock to set exact time</div>

              {rules?.clock?.modes?.length ? (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className="text-[11px] font-bold text-white/60">Style</div>
                  <select
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
                    value={clockMode}
                    onChange={(e) => setClockMode(e.target.value)}
                  >
                    {rules.clock.modes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {game.timer_running ? (
                  <button
                    onClick={onPause}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black active:scale-95"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={onStart}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black active:scale-95"
                  >
                    Start
                  </button>
                )}
                <button
                  onClick={() => onReset(game.duration_seconds || clockPresets[clockPresets.length - 1] || 1800)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black active:scale-95"
                >
                  Reset
                </button>

                {clockPresets.map((s) => (
                  <button
                    key={`${desktop ? "d" : "m"}Preset-${s}`}
                    onClick={() => onReset(s)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold active:scale-95"
                  >
                    {fmtClock(s)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-2 text-center text-sm text-white/70">This sport does not use a game clock.</div>
          )}

          <button
            onClick={() => setConfirmFinalizeOpen(true)}
            className="mt-4 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/15 active:scale-95"
          >
            Finalize Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white">
      {err ? (
        <div className="mx-auto max-w-6xl px-3 pt-3 sm:px-4">
          <div className="rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-3 pt-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-xs opacity-80 sm:text-sm">{header}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSuperCompact((v) => !v)}
              className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10"
              title="Toggle tighter stat chips"
            >
              {superCompact ? "Compact: ON" : "Compact: OFF"}
            </button>
            <button
              onClick={() => router.push("/")}
              className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Home
            </button>
          </div>
        </div>

        {/* Desktop scoreboard */}
        <div className="mt-4">
          <ScoreboardPanel desktop />
        </div>

        {/* Mobile scoreboard */}
        <div className="mt-4">
          <ScoreboardPanel />
        </div>

        {/* Players */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-black">{leftLabel} Players</div>
              <button
                onClick={() => setShowBenchA((v) => !v)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10"
              >
                {showBenchA ? "Hide Bench" : `Show Bench (${benchA.length})`}
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {playingA.length ? (
                playingA.map((p) => {
                  const idx = rosterA.findIndex((x) => x.player_id === p.player_id);
                  return <PlayerRow key={p.player_id} p={p} sideLabel="A" idx={Math.max(0, idx)} total={rosterA.length} />;
                })
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm opacity-70">
                  No one is in the game yet. Open the bench and tap <b>Add</b>.
                </div>
              )}
            </div>

            {showBenchA ? (
              <div className="mt-4 space-y-2">
                {benchA.length ? (
                  benchA.map((p) => <BenchRow key={p.player_id} p={p} sideLabel="A" />)
                ) : (
                  <div className="text-xs opacity-50">No bench.</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-black">{rightLabel} Players</div>
              <button
                onClick={() => setShowBenchB((v) => !v)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10"
              >
                {showBenchB ? "Hide Bench" : `Show Bench (${benchB.length})`}
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {playingB.length ? (
                playingB.map((p) => {
                  const idx = rosterB.findIndex((x) => x.player_id === p.player_id);
                  return <PlayerRow key={p.player_id} p={p} sideLabel="B" idx={Math.max(0, idx)} total={rosterB.length} />;
                })
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm opacity-70">
                  No one is in the game yet. Open the bench and tap <b>Add</b>.
                </div>
              )}
            </div>

            {showBenchB ? (
              <div className="mt-4 space-y-2">
                {benchB.length ? (
                  benchB.map((p) => <BenchRow key={p.player_id} p={p} sideLabel="B" />)
                ) : (
                  <div className="text-xs opacity-50">No bench.</div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 pb-10 text-xs opacity-50">Live Game ID: {String(game.id)}</div>
      </div>

      {setTimeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#08172c] p-5">
            <div className="text-lg font-black">Set Clock Time</div>
            <div className="mt-1 text-sm text-white/70">
              Enter time as <b>mm:ss</b>. Clock will remain paused.
            </div>

            <input
              value={timeInput}
              onChange={(e) => setTimeInput(formatMMSSFromDigits(e.target.value))}
              inputMode="numeric"
              placeholder="mm:ss"
              className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-3xl font-black tracking-widest text-white outline-none focus:border-white/30"
            />

            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold"
                onClick={() => setSetTimeOpen(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-black"
                onClick={async () => {
                  const seconds = parseMMSS(timeInput);
                  if (seconds === null) {
                    setErr("Time must be in mm:ss format (example: 11:05).");
                    return;
                  }
                  setSetTimeOpen(false);
                  await setExactRemaining(seconds);
                  await refreshGame();
                }}
              >
                Set Time
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmFinalizeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#08172c] p-5">
            <div className="text-lg font-black">Finalize this game?</div>
            <div className="mt-2 text-sm text-white/70">This will lock the score and update standings + stat leaders.</div>

            {rules?.clock?.enabled && derived.isRunning ? (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm">Pause the clock before finalizing.</div>
            ) : null}

            {(() => {
              const sa = Number(game?.score_a || 0);
              const sb = Number(game?.score_b || 0);
              if (sa === 0 && sb === 0) return (
                <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">⚠️ Score is 0-0. Add points before finalizing.</div>
              );
              if (sa === sb) return (
                <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">⚠️ Score is tied ({sa}-{sb}). Bauercrest has no ties — adjust before finalizing.</div>
              );
              return null;
            })()}

            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold"
                onClick={() => setConfirmFinalizeOpen(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-black"
                disabled={rules?.clock?.enabled && derived.isRunning}
                onClick={async () => {
                  setConfirmFinalizeOpen(false);
                  await finalizeGame();
                }}
              >
                Finalize
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}