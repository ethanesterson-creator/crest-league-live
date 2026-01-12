"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

// Keep the human-friendly sport names for the dropdown.
// getSportRules() normalizes these internally.
const SPORTS = [
  "Hoop",
  "Softball",
  "Volleyball",
  "Football",
  "Speedball",
  "Euro",
  "Soccer",
  "Hockey",
];

const LEVELS = ["A", "B", "C", "D"];
const MODES = ["5v5", "7v7", "11v11", "3v3", "2v2", "1v1"];

// Fallback presets if something is missing in sportRules
const FALLBACK_TIMER_PRESETS = [
  { label: "30:00", seconds: 1800 },
  { label: "20:00", seconds: 1200 },
  { label: "15:00", seconds: 900 },
  { label: "10:00", seconds: 600 },
  { label: "05:00", seconds: 300 },
];

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds ?? 0)));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

async function loadLeagues(setLeagues) {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name")
    .order("id", { ascending: true });

  if (error) {
    // fallback if leagues table isn't ready
    setLeagues([
      { id: "seniors", name: "Seniors" },
      { id: "juniors", name: "Juniors" },
      { id: "sophomores", name: "Sophomores" },
    ]);
    return;
  }

  setLeagues(data ?? []);
}

export default function HomePage() {
  const [status, setStatus] = useState("Checking…");
  const [err, setErr] = useState("");
  const [games, setGames] = useState([]);

  // leagues for dropdown (from Supabase)
  const [leagues, setLeagues] = useState([]);

  // form
  const [leagueKey, setLeagueKey] = useState("seniors");
  const [sport, setSport] = useState("Hoop");
  const [level, setLevel] = useState("A");
  const [mode, setMode] = useState("5v5");

  // sport rules (drives timer presets + clock visibility)
  const rules = useMemo(() => getSportRules(sport), [sport]);
  const clockEnabled = !!rules?.clock?.enabled;

  // clock style (quarters/halves/periods/etc)
  const clockModes = useMemo(() => rules?.clock?.modes ?? [], [rules]);
  const [clockStyle, setClockStyle] = useState("");

  // timer preset seconds
  const [preset, setPreset] = useState(FALLBACK_TIMER_PRESETS[0].seconds);

  // teams from players table
  const [teams, setTeams] = useState([]);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");

  // When sport changes, pick a default clock style + preset
  useEffect(() => {
    if (!clockEnabled) {
      setClockStyle("");
      setPreset(0);
      return;
    }

    const defStyle =
      rules?.clock?.defaultMode ||
      (clockModes.length ? clockModes[0].id : "countdown");
    setClockStyle(defStyle);

    const modeObj =
      clockModes.find((m) => m.id === defStyle) ?? clockModes[0] ?? null;

    const presets = modeObj?.presets?.length
      ? modeObj.presets
      : FALLBACK_TIMER_PRESETS.map((p) => p.seconds);

    // default to the longest preset (feels natural for game creation)
    setPreset(presets[presets.length - 1] ?? 1800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  const timerOptions = useMemo(() => {
    if (!clockEnabled) return [];

    const modeObj =
      clockModes.find((m) => m.id === clockStyle) ?? clockModes[0] ?? null;

    const secondsList = modeObj?.presets?.length
      ? modeObj.presets
      : FALLBACK_TIMER_PRESETS.map((p) => p.seconds);

    // Convert to {label, seconds}
    return secondsList.map((s) => ({ seconds: s, label: fmtClock(s) }));
  }, [clockEnabled, clockModes, clockStyle]);

  async function ping() {
    setErr("");
    const { error } = await supabase.from("live_games").select("id").neq("status", "draft").limit(1);
    setStatus(error ? `Supabase error: ${error.message}` : "Connected ✅");
    if (error) setErr(error.message);
  }

  async function loadTeamsFromPlayers() {
    const lk = norm(leagueKey);
    const { data, error } = await supabase
      .from("players")
      .select("team_name, league_id")
      .eq("league_id", lk)
      .limit(5000);

    if (error) return;

    const unique = Array.from(
      new Set((data || []).map((r) => norm(r.team_name)).filter(Boolean))
    ).sort();

    setTeams(unique);

    setTeamA((prev) => (prev && unique.includes(norm(prev)) ? prev : unique[0] || ""));
    setTeamB((prev) => (prev && unique.includes(norm(prev)) ? prev : unique[1] || ""));
  }

  async function loadGames() {
    setErr("");
    const { data, error } = await supabase
      .from("live_games")
      .select("*")
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      setErr(error.message);
      return;
    }
    setGames(data || []);
  }

  useEffect(() => {
    ping();
    loadGames();
    loadLeagues(setLeagues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTeamsFromPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueKey]);

  const canCreate = useMemo(() => {
    return norm(leagueKey) && norm(teamA) && norm(teamB) && norm(teamA) !== norm(teamB);
  }, [leagueKey, teamA, teamB]);

  async function createGame() {
    setErr("");

    const duration = clockEnabled ? Number(preset || 0) : 0;

    const payload = {
      league_key: norm(leagueKey),
      sport, // keep display value; live page normalizes
      level,
      mode,
      team_a1: norm(teamA),
      team_b1: norm(teamB),
      score_a: 0,
      score_b: 0,

      // timer fields
      duration_seconds: duration,
      timer_running: false,
      timer_anchor_ts: null,
      timer_remaining_seconds: duration,
      timer_remaining_at_anchor: duration,

      // store the clock style (quarters/halves/periods/countdown)
      clock_style: clockEnabled ? (clockStyle || "countdown") : "none",

      status: "active",
      notes: "",
    };

    const { data, error } = await supabase
      .from("live_games")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setErr(error.message);
      return;
    }

    await loadGames();
    window.location.href = `/live/${data.id}`;
  }

  async function deleteGame(id) {
  try {
    setErr?.(""); // if you have setErr in this file
    const ok = confirm("Delete this game? (Only allowed if NOT finalized)");
    if (!ok) return;

    const { error } = await supabase.rpc("delete_unfinalized_game", { gid: id });
    if (error) throw error;

    // refresh your list (pick the one you already use)
    // If you have a loadGames() function, call it:
    await loadGames?.();

  } catch (e) {
    const msg = e?.message ?? String(e);

    // Friendly error if they somehow try deleting a final game
    if (msg.toLowerCase().includes("cannot delete finalized")) {
      setErr?.("This game is finalized and can only be deleted by admin.");
    } else {
      setErr?.(msg);
    }
  }
}


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Crest League Live</h1>
            <div className="mt-1 text-sm text-slate-300">
              Status: <span className="font-semibold text-emerald-400">{status}</span>
            </div>
          </div>
          <button
            onClick={loadGames}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {/* Create game card */}
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow">
          <div className="text-lg font-bold">Create Live Game</div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <div className="mb-1 text-slate-300">League Key (age group)</div>

              <select
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/30"
                value={leagueKey}
                onChange={(e) => setLeagueKey(e.target.value)}
              >
                {(leagues?.length
                  ? leagues
                  : [
                      { id: "seniors", name: "Seniors" },
                      { id: "juniors", name: "Juniors" },
                      { id: "sophomores", name: "Sophomores" },
                    ]
                ).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name ?? l.id}
                  </option>
                ))}
              </select>

              <div className="mt-1 text-xs text-slate-400">
                Tip: your players table uses <b>league_id</b> like “seniors”.
              </div>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Mode</div>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Sport</div>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
              >
                {SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Level</div>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Team A</div>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={teamA}
                onChange={(e) => setTeamA(e.target.value)}
              >
                <option value="">Select…</option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-slate-400">
                Pulled from players.team_name (lowercased)
              </div>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Team B</div>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={teamB}
                onChange={(e) => setTeamB(e.target.value)}
              >
                <option value="">Select…</option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            {/* ✅ Clock Style (only if sport has clock modes) */}
            {clockEnabled && clockModes.length > 0 ? (
              <label className="text-sm sm:col-span-2">
                <div className="mb-1 text-slate-300">Clock Style</div>
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={clockStyle}
                  onChange={(e) => setClockStyle(e.target.value)}
                >
                  {clockModes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {/* ✅ Timer Preset: ONLY if sport uses a clock */}
            {clockEnabled ? (
              <label className="text-sm sm:col-span-2">
                <div className="mb-1 text-slate-300">Timer Preset</div>
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={preset}
                  onChange={(e) => setPreset(Number(e.target.value))}
                >
                  {(timerOptions.length ? timerOptions : FALLBACK_TIMER_PRESETS).map((p) => (
                    <option key={p.seconds} value={p.seconds}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="text-xs text-slate-400 sm:col-span-2">
                This sport does not use a game clock — no timer preset needed.
              </div>
            )}
          </div>

          <button
            onClick={createGame}
            disabled={!canCreate}
            className={`mt-4 w-full rounded-2xl px-4 py-3 text-lg font-extrabold shadow
              ${
                canCreate
                  ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  : "bg-slate-800 text-slate-400"
              }`}
          >
            Create Game
          </button>

          {err ? (
            <div className="mt-3 rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}
        </div>

        {/* Recent games */}
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 text-lg font-bold">Recent Live Games</div>

          {games.length === 0 ? (
            <div className="text-sm text-slate-400">No games yet.</div>
          ) : (
            <div className="space-y-3">
              {games.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-400">
                        {new Date(g.created_at).toLocaleString()}
                      </div>
                      <div className="mt-1 text-xl font-extrabold">
                        {g.team_a1} vs {g.team_b1}
                      </div>
                      <div className="mt-1 text-sm text-slate-300">
                        {g.league_key} • {g.sport} • Level {g.level} • {g.mode} •{" "}
                        <span className="text-emerald-400 font-semibold">{g.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 break-all">ID: {g.id}</div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center">
                        <div className="text-xs text-slate-400">Score</div>
                        <div className="text-3xl font-black tabular-nums">
                          {g.score_a} - {g.score_b}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Link
                          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-slate-950 hover:bg-emerald-400"
                          href={`/live/${g.id}`}
                        >
                          Open
                        </Link>
                        {g.status !== "final" ? (
                        <button
                          onClick={() => deleteGame(g.id)}
                         className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-100 hover:bg-red-500/20"
                           >
                           Delete
                              </button>
                              ) : (
                                <div className="text-xs text-white/50 italic">Finalized — admin only</div>
                                )}

                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>        
      </div>
    </div>
  );
}
