"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Live game scoring page
 * - Supports bench -> in-game flow
 * - Supports editable clock
 * - Adds batting-order reorder (Softball/Kickball)
 * - Adds captain/role display if players.role exists
 */

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function fmtClock(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return `${mm}:${ss}`;
}

function parseClockTextToSeconds(text) {
  // Accepts MM:SS only
  const raw = String(text || "").trim();
  const m = raw.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const ss = Number(m[2]);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  return mm * 60 + ss;
}

function uniqNonEmpty(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

export default function LiveGamePage() {
  const params = useParams();
  const gameId = params?.id;

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [game, setGame] = useState(null);

  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);

  // Player metadata (for captain label / consistent names)
  const [playersById, setPlayersById] = useState({});

  // Batting-order / reorder UI (only for batting sports)
  const [reorderA, setReorderA] = useState(false);
  const [reorderB, setReorderB] = useState(false);

  // Bench UI
  const [showBenchA, setShowBenchA] = useState(true);
  const [showBenchB, setShowBenchB] = useState(true);

  // Clock
  const [clockEnabled, setClockEnabled] = useState(true);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);
  const [clockEditOpen, setClockEditOpen] = useState(false);
  const [clockEditText, setClockEditText] = useState("00:00");

  const tickRef = useRef(null);

  function isBattingSport(sport) {
    const s2 = norm(sport);
    return s2 === "softball" || s2 === "kickball";
  }

  function sortRosterRows(rows) {
    // Prefer persisted order if available
    return [...(rows || [])].sort((a, b) => {
      const ao = Number(a.sort_order ?? 0);
      const bo = Number(b.sort_order ?? 0);
      if (ao !== bo) return ao - bo;
      return String(a.player_name || "").localeCompare(String(b.player_name || ""));
    });
  }

  async function loadPlayerMeta(playerIds) {
    // Try to include `role` if the column exists; fall back gracefully if it doesn't.
    const ids = uniqNonEmpty(playerIds || []);
    if (!ids.length) {
      setPlayersById({});
      return;
    }

    // First attempt: include role
    let res = await supabase
      .from("players")
      .select("id, first_name, last_name, team_name, league_id, role")
      .in("id", ids)
      .limit(5000);

    if (res.error) {
      // Fallback: no role column
      res = await supabase
        .from("players")
        .select("id, first_name, last_name, team_name, league_id")
        .in("id", ids)
        .limit(5000);

      if (res.error) return;
    }

    const map = {};
    for (const p of res.data || []) map[p.id] = p;
    setPlayersById(map);
  }

  function displayNameForRosterRow(row) {
    const meta = playersById?.[row.player_id];
    const base =
      (row.player_name && String(row.player_name).trim()) ||
      (meta ? `${String(meta.first_name || "").trim()} ${String(meta.last_name || "").trim()}`.trim() : "") ||
      String(row.player_id || "");

    const role = String(meta?.role || "").toLowerCase();
    if (role === "captain") return `${base} (C)`;
    if (role === "coach") return `${base} (Coach)`;
    return base;
  }

  // Stat config comes from points_rules.stat_keys in your project.
  // Here we keep what you already had: we’ll derive from game.stat_keys if present.
  const statDefs = useMemo(() => {
    const raw = String(game?.stat_keys || "").trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((s3) => norm(s3))
      .filter(Boolean)
      .map((k) => ({ key: k, label: k.toUpperCase() }));
  }, [game?.stat_keys]);

  const teamAName = useMemo(() => game?.team_a1 || "Home", [game?.team_a1]);
  const teamBName = useMemo(() => game?.team_b1 || "Away", [game?.team_b1]);

  const leftLabel = teamAName;
  const rightLabel = teamBName;

  const playingA = useMemo(() => sortRosterRows(rosterA.filter((p) => p.is_playing)), [rosterA]);
  const playingB = useMemo(() => sortRosterRows(rosterB.filter((p) => p.is_playing)), [rosterB]);

  const benchA = useMemo(() => sortRosterRows(rosterA.filter((p) => !p.is_playing)), [rosterA]);
  const benchB = useMemo(() => sortRosterRows(rosterB.filter((p) => !p.is_playing)), [rosterB]);

  useEffect(() => {
    if (!gameId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    // Clock ticking
    if (!clockRunning || !clockEnabled) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }

    tickRef.current = setInterval(() => {
      setClockSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [clockRunning, clockEnabled]);

  useEffect(() => {
    setClockEditText(fmtClock(clockSeconds));
  }, [clockSeconds]);

  async function load() {
    setErr("");
    setMsg("");

    const { data: g, error: gErr } = await supabase.from("live_games").select("*").eq("id", gameId).single();
    if (gErr) {
      setErr(gErr.message);
      return;
    }
    setGame(g);

    // basic clock state from live_games if you store it there; otherwise keep existing
    setClockEnabled(Boolean(g.clock_enabled ?? true));
    setClockSeconds(Number(g.clock_seconds ?? 0));
    setClockRunning(Boolean(g.clock_running ?? false));

    await ensureRoster(g);
  }

  async function ensureRoster(g) {
    // load roster if it exists
    const { data: r1, error: rErr } = await supabase
      .from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", gameId);

    if (!rErr && r1 && r1.length) {
      const a = sortRosterRows(r1.filter((x) => x.team_side === "A"));
      const b = sortRosterRows(r1.filter((x) => x.team_side === "B"));
      setRosterA(a);
      setRosterB(b);

      // Load player meta so we can show consistent names / captain label
      loadPlayerMeta(r1.map((x) => x.player_id));
      return;
    }

    // No roster: build from players table based on teams
    const leagueKey = norm(g.league_key);
    const ta = norm(g.team_a1);
    const tb = norm(g.team_b1);

    const { data: players, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, team_name, league_id")
      .eq("league_id", leagueKey)
      .in("team_name", [g.team_a1, g.team_b1])
      .limit(5000);

    if (pErr) {
      setErr(pErr.message);
      return;
    }

    const rosterRows = [];
    for (const pl of players || []) {
      const fullName = `${String(pl.first_name || "").trim()} ${String(pl.last_name || "").trim()}`.trim();
      const side = norm(pl.team_name) === ta ? "A" : "B";

      rosterRows.push({
        game_id: gameId,
        player_id: pl.id,
        player_name: fullName,
        team_side: side,
        team_name: pl.team_name,
        is_playing: false,
        sort_order: 0,
      });
    }

    if (rosterRows.length) {
      const { error: insErr } = await supabase.from("game_roster").insert(rosterRows);
      if (insErr) {
        setErr(insErr.message);
        return;
      }
    }

    setRosterA(sortRosterRows(rosterRows.filter((x) => x.team_side === "A")));
    loadPlayerMeta(rosterRows.map((x) => x.player_id));
    setRosterB(sortRosterRows(rosterRows.filter((x) => x.team_side === "B")));
  }

  function getMaxSortOrder(side) {
    const rows = side === "A" ? rosterA : rosterB;
    let max = 0;
    for (const r of rows || []) {
      if (r.team_side !== side) continue;
      const o = Number(r.sort_order || 0);
      if (o > max) max = o;
    }
    return max;
  }

  async function persistSortOrder(playerId, sortOrder) {
    // This will no-op if the `sort_order` column doesn't exist yet.
    const { error } = await supabase.from("game_roster").update({ sort_order: sortOrder }).eq("game_id", gameId).eq("player_id", playerId);
    if (error) {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("sort_order")) return;
    }
  }

  async function movePlaying(side, fromIndex, dir) {
    // Simple mobile-friendly batting order: move up/down with arrows.
    const rows = side === "A" ? rosterA : rosterB;
    const setRows = side === "A" ? setRosterA : setRosterB;

    const playing = sortRosterRows(rows.filter((r) => r.is_playing));
    const toIndex = fromIndex + dir;
    if (toIndex < 0 || toIndex >= playing.length) return;

    const a = playing[fromIndex];
    const b = playing[toIndex];

    const nextA = Number(b.sort_order || toIndex + 1) || 0;
    const nextB = Number(a.sort_order || fromIndex + 1) || 0;

    // Update local state
    const nextRows = rows.map((r) => {
      if (r.player_id === a.player_id) return { ...r, sort_order: nextA };
      if (r.player_id === b.player_id) return { ...r, sort_order: nextB };
      return r;
    });
    setRows(sortRosterRows(nextRows));

    // Persist best-effort
    await persistSortOrder(a.player_id, nextA);
    await persistSortOrder(b.player_id, nextB);
  }

  async function togglePlaying(rowOrPlayerId) {
    const playerId = typeof rowOrPlayerId === "string" ? rowOrPlayerId : rowOrPlayerId?.player_id;
    if (!playerId) return;

    const row =
      rosterA.find((x) => x.player_id === playerId) ||
      rosterB.find((x) => x.player_id === playerId);

    if (!row) return;

    const nextPlaying = !row.is_playing;

    // If this is a batting sport, give newly-added players an order number
    const batting = isBattingSport(game?.sport);

    const nextRow = { ...row, is_playing: nextPlaying };

    if (batting && nextPlaying) {
      const side = row.team_side;
      const max = getMaxSortOrder(side);
      const already = Number(row.sort_order || 0);
      if (!already) nextRow.sort_order = max + 1;
    }

    const updatePayload = { is_playing: nextPlaying };
    if (typeof nextRow.sort_order !== "undefined") updatePayload.sort_order = nextRow.sort_order;

    const { error } = await supabase
      .from("game_roster")
      .update(updatePayload)
      .eq("game_id", gameId)
      .eq("player_id", playerId);

    if (error) {
      setErr(error.message);
      return;
    }

    if (row.team_side === "A") setRosterA(sortRosterRows(rosterA.map((x) => (x.player_id === playerId ? nextRow : x))));
    else setRosterB(sortRosterRows(rosterB.map((x) => (x.player_id === playerId ? nextRow : x))));
  }

  async function setClockFromText() {
    const sec = parseClockTextToSeconds(clockEditText);
    if (sec === null) return;

    // Pause while editing, and remain paused after setting
    setClockRunning(false);
    setClockSeconds(sec);
    setClockEditOpen(false);

    await supabase
      .from("live_games")
      .update({ clock_seconds: sec, clock_running: false })
      .eq("id", gameId);
  }

  async function toggleClock() {
    const next = !clockRunning;
    setClockRunning(next);
    await supabase.from("live_games").update({ clock_running: next }).eq("id", gameId);
  }

  async function finalizeGame() {
    setErr("");
    setMsg("");

    const ok = confirm("Finalize this game? This will update standings and stat leaders.");
    if (!ok) return;

    const { error } = await supabase.rpc("finalize_game", { gid: gameId });
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg("Finalized ✅");
  }

  function PlayerRow({ p, sideLabel, index, total, canReorder, onMoveUp, onMoveDown }) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-base font-extrabold">
                {displayNameForRosterRow(p) || p.player_id}
              </div>

              {canReorder ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={index === 0}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-extrabold text-white/90 disabled:opacity-30"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={index === total - 1}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-extrabold text-white/90 disabled:opacity-30"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              ) : null}
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

  function BenchRow({ p }) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
        <div className="truncate text-sm font-bold text-white/85">
          {displayNameForRosterRow(p) || p.player_id}
        </div>
        <button
          onClick={() => togglePlaying(p)}
          className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-extrabold text-emerald-200 active:scale-95"
          title="Add to playing"
        >
          Add
        </button>
      </div>
    );
  }

  function StatChip({ p, sd }) {
    return (
      <button
        onClick={() => addStat(p.player_id, sd.key)}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/90 active:scale-95"
      >
        +{sd.label}
      </button>
    );
  }

  async function addStat(playerId, statKey) {
    setErr("");
    const { error } = await supabase.from("live_events").insert({
      game_id: gameId,
      event_type: "stat",
      player_id: playerId,
      stat_key: statKey,
      delta: 1,
      team_name:
        rosterA.find((x) => x.player_id === playerId)?.team_name ||
        rosterB.find((x) => x.player_id === playerId)?.team_name ||
        null,
      created_at: new Date().toISOString(),
    });

    if (error) setErr(error.message);
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-4xl p-6">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white/60">
              {game.league_key} • {game.sport} • Level {game.level} • {game.mode}
            </div>
            <div className="text-2xl font-black">
              {teamAName} vs {teamBName}
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-extrabold">
              Home
            </Link>
          </div>
        </div>

        {err ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}
        {msg ? (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {msg}
          </div>
        ) : null}

        {/* Score + Clock */}
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/60">HOME</div>
              <div className="mt-1 text-3xl font-black">{teamAName}</div>
              <div className="mt-2 text-5xl font-black">{Number(game.score_a || 0)}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
              <div className="text-xs text-white/60">GAME CLOCK</div>
              <div className="mt-2 text-6xl font-black">{fmtClock(clockSeconds)}</div>

              {clockEnabled ? (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={toggleClock}
                    className="rounded-xl bg-white px-5 py-2 text-sm font-extrabold text-slate-950 active:scale-95"
                  >
                    {clockRunning ? "Pause" : "Start"}
                  </button>

                  <button
                    onClick={() => {
                      setClockRunning(false);
                      setClockEditOpen((v) => !v);
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-extrabold text-white/90 active:scale-95"
                  >
                    Set Time
                  </button>
                </div>
              ) : null}

              {clockEditOpen ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-left">
                  <div className="text-xs text-white/60">Enter time (MM:SS)</div>
                  <input
                    value={clockEditText}
                    onChange={(e) => setClockEditText(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-lg font-black outline-none"
                    inputMode="numeric"
                    placeholder="00:11"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={setClockFromText}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-slate-950 active:scale-95"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setClockEditOpen(false)}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-extrabold text-white/90 active:scale-95"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-right">
              <div className="text-xs text-white/60">AWAY</div>
              <div className="mt-1 text-3xl font-black">{teamBName}</div>
              <div className="mt-2 text-5xl font-black">{Number(game.score_b || 0)}</div>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button
              onClick={finalizeGame}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-8 py-3 text-base font-black text-emerald-100 active:scale-95"
            >
              Finalize Game
            </button>
          </div>
        </div>

        {/* Players */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* A */}
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-lg font-black">{leftLabel} Players</div>
              <div className="flex items-center gap-2">
                {isBattingSport(game?.sport) ? (
                  <button
                    type="button"
                    onClick={() => setReorderA((v) => !v)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/90"
                    title="Reorder batting order"
                  >
                    {reorderA ? "Done" : "Reorder"}
                  </button>
                ) : null}

                <button
                  onClick={() => setShowBenchA((v) => !v)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/90"
                >
                  {showBenchA ? "Collapse Bench" : "Open Bench"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {playingA.map((p, i) => (
                <PlayerRow
                  key={p.player_id}
                  p={p}
                  sideLabel="A"
                  index={i}
                  total={playingA.length}
                  canReorder={isBattingSport(game?.sport) && reorderA}
                  onMoveUp={() => movePlaying("A", i, -1)}
                  onMoveDown={() => movePlaying("A", i, 1)}
                />
              ))}
            </div>

            {showBenchA ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-extrabold text-white/60">BENCH</div>
                <div className="flex flex-col gap-2">
                  {benchA.map((p) => (
                    <BenchRow key={p.player_id} p={p} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* B */}
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-lg font-black">{rightLabel} Players</div>
              <div className="flex items-center gap-2">
                {isBattingSport(game?.sport) ? (
                  <button
                    type="button"
                    onClick={() => setReorderB((v) => !v)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/90"
                    title="Reorder batting order"
                  >
                    {reorderB ? "Done" : "Reorder"}
                  </button>
                ) : null}

                <button
                  onClick={() => setShowBenchB((v) => !v)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/90"
                >
                  {showBenchB ? "Collapse Bench" : "Open Bench"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {playingB.map((p, i) => (
                <PlayerRow
                  key={p.player_id}
                  p={p}
                  sideLabel="B"
                  index={i}
                  total={playingB.length}
                  canReorder={isBattingSport(game?.sport) && reorderB}
                  onMoveUp={() => movePlaying("B", i, -1)}
                  onMoveDown={() => movePlaying("B", i, 1)}
                />
              ))}
            </div>

            {showBenchB ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-extrabold text-white/60">BENCH</div>
                <div className="flex flex-col gap-2">
                  {benchB.map((p) => (
                    <BenchRow key={p.player_id} p={p} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
