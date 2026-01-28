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

function matchupLabel(a1, a2) {
  const x1 = norm(a1);
  const x2 = norm(a2);
  if (x1 && x2 && x1 !== x2) return `${x1} + ${x2}`;
  return x1 || "—";
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

  // Bench toggles
  // Bench-first: start open so counselors can pick who is in
  const [showBenchA, setShowBenchA] = useState(true);
  const [showBenchB, setShowBenchB] = useState(true);

  // Compact toggle
  const [superCompact, setSuperCompact] = useState(true);

  // ✅ Phase 1B: editable time modal
  const [setTimeOpen, setSetTimeOpen] = useState(false);
  const [timeInput, setTimeInput] = useState("00:00");

  // UI clock tick
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
    const anchorTs = Number(game.timer_anchor_ts ?? 0); // float8 seconds
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

  async function ensureRoster(g) {
    setErr("");

    const { data: r1, error: rErr } = await supabase
      .from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing")
      .eq("game_id", g.id)
      .limit(5000);

    if (rErr) {
      setErr(rErr.message);
      return;
    }

    if (r1 && r1.length) {
      const a = r1.filter((x) => x.team_side === "A");
      const b = r1.filter((x) => x.team_side === "B");
      setRosterA(a);
      setRosterB(b);

      // Bench-first: if nobody is in game yet, keep bench open
      if (a.filter((p) => p.is_playing).length === 0) setShowBenchA(true);
      if (b.filter((p) => p.is_playing).length === 0) setShowBenchB(true);

      return;
    }

    // Build roster if missing
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

    const rows = (players || []).map((p) => {
      const tn = norm(p.team_name);
      const side = teamsA.includes(tn) ? "A" : "B";
      return {
        game_id: g.id,
        player_id: String(p.id),
        player_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        team_side: side,
        team_name: tn,
        // Phase 1A: everyone starts BENCHED
        is_playing: false,
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
      .select("game_id, player_id, player_name, team_side, team_name, is_playing")
      .eq("game_id", g.id)
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

  function uniqNonEmpty(arr) {
    return Array.from(new Set((arr || []).map((x) => norm(x)).filter(Boolean)));
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

  // ✅ Phase 1B: set remaining time precisely, without changing duration_seconds
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

    // If running, pause first so we freeze the time
    if (derived.isRunning) {
      await onPause();
    }

    // Populate input with current remaining time
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

    // ✅ Bench stays open until counselor collapses manually
    if (player.team_side === "A") setRosterA((r) => apply(r));
    else setRosterB((r) => apply(r));
  }

  async function finalizeGame() {
    if (!game) return;
    setErr("");

    if (rules?.clock?.enabled && derived.isRunning) {
      setErr("Pause the clock before finalizing.");
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

  function PlayerRow({ p, sideLabel }) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-base font-extrabold">{p.player_name || p.player_id}</div>
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
    return (
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 p-3">
        <div className="min-w-0">
          <div className="truncate font-semibold opacity-90">{p.player_name || p.player_id}</div>
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

        {/* Compact scoreboard (mobile) */}
        <div className="mt-4 md:hidden">
          <div className="rounded-2xl border border-white/10 bg-[#08172c]/85 p-4 backdrop-blur">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] tracking-widest opacity-70">HOME</div>
                <div className="mt-1 truncate text-lg font-extrabold">{leftLabel}</div>
                <div className="mt-1 text-4xl font-black tabular-nums">{scoreA}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {scoreButtons.map((d) => (
                    <button
                      key={`mA-${d}`}
                      onClick={() => bumpScore("A", d)}
                      className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-base font-extrabold active:scale-95"
                    >
                      +{d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] tracking-widest opacity-70">AWAY</div>
                <div className="mt-1 truncate text-lg font-extrabold">{rightLabel}</div>
                <div className="mt-1 text-4xl font-black tabular-nums">{scoreB}</div>
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  {scoreButtons.map((d) => (
                    <button
                      key={`mB-${d}`}
                      onClick={() => bumpScore("B", d)}
                      className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-base font-extrabold active:scale-95"
                    >
                      +{d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] tracking-widest opacity-70">
                {rules?.clock?.enabled ? "GAME CLOCK" : "NO CLOCK"}
              </div>

              {rules?.clock?.enabled ? (
                <>
                  {/* ✅ Tap-to-edit clock */}
                  <button
                    type="button"
                    onClick={openSetTimeModal}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 py-2 text-center text-5xl font-black tabular-nums active:scale-[0.99]"
                    title="Tap to set exact time (mm:ss)"
                  >
                    {fmtClock(derived.remaining)}
                  </button>
                  <div className="mt-1 text-center text-xs text-white/60">Tap clock to set exact time</div>

                  {rules?.clock?.modes?.length ? (
                    <div className="mt-2 flex items-center justify-center gap-2">
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

                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    {game.timer_running ? (
                      <button onClick={onPause} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black active:scale-95">
                        Pause
                      </button>
                    ) : (
                      <button onClick={onStart} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black active:scale-95">
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
                        key={`mPreset-${s}`}
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
                className="mt-3 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-black text-emerald-100 hover:bg-emerald-500/15 active:scale-95"
              >
                Finalize Game
              </button>
            </div>
          </div>
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
                playingA.map((p) => <PlayerRow key={p.player_id} p={p} sideLabel="A" />)
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm opacity-70">
                  No one is in the game yet. Open the bench and tap <b>Add</b>.
                </div>
              )}
            </div>

            {showBenchA ? (
              <div className="mt-4 space-y-2">
                {benchA.length ? benchA.map((p) => <BenchRow key={p.player_id} p={p} sideLabel="A" />) : <div className="text-xs opacity-50">No bench.</div>}
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
                playingB.map((p) => <PlayerRow key={p.player_id} p={p} sideLabel="B" />)
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm opacity-70">
                  No one is in the game yet. Open the bench and tap <b>Add</b>.
                </div>
              )}
            </div>

            {showBenchB ? (
              <div className="mt-4 space-y-2">
                {benchB.length ? benchB.map((p) => <BenchRow key={p.player_id} p={p} sideLabel="B" />) : <div className="text-xs opacity-50">No bench.</div>}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 pb-10 text-xs opacity-50">Live Game ID: {String(game.id)}</div>
      </div>

      {/* ✅ Set Time Modal */}
      {setTimeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#08172c] p-5">
            <div className="text-lg font-black">Set Clock Time</div>
            <div className="mt-1 text-sm text-white/70">Enter time as <b>mm:ss</b>. Clock will remain paused.</div>

            <input
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
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
