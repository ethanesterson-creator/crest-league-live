"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

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

const LEVELS = ["A", "B", "C"];
const MODES = ["5v5", "6v6", "7v7", "8v8", "9v9", "10v10"];

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds ?? 0)));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function PostGamesPage() {
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [leagueKey, setLeagueKey] = useState("seniors");
  const [sport, setSport] = useState("Hoop");
  const [level, setLevel] = useState("A");
  const [mode, setMode] = useState("5v5");

  const [teams, setTeams] = useState([]);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");

  // date only
  const [playedOn, setPlayedOn] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  });

  const rules = useMemo(() => getSportRules(sport), [sport]);
  const clockEnabled = !!rules?.clock?.enabled;

  const [clockStyle, setClockStyle] = useState("");
  const [preset, setPreset] = useState(0);

  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);

  async function loadTeams(lk) {
    const { data, error } = await supabase
      .from("players")
      .select("team_name, league_id")
      .eq("league_id", lk)
      .limit(5000);

    if (error) {
      setTeams([]);
      return;
    }

    const uniq = new Set();
    for (const p of data || []) {
      const t = norm(p.team_name);
      if (t) uniq.add(t);
    }
    const list = Array.from(uniq).sort((a, b) => a.localeCompare(b));
    setTeams(list);

    if (list.length) {
      setTeamA((prev) => (norm(prev) ? prev : list[0]));
      setTeamB((prev) => {
        if (norm(prev)) return prev;
        return list[1] ?? list[0];
      });
    } else {
      setTeamA("");
      setTeamB("");
    }
  }

  async function loadDrafts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("live_games")
        .select(
          "id, created_at, played_on, league_key, sport, level, mode, team_a1, team_b1, score_a, score_b, status"
        )
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setDrafts(data || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeams(norm(leagueKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueKey]);

  useEffect(() => {
    // initialize clock UI based on sport rules
    if (!clockEnabled) {
      setClockStyle("");
      setPreset(0);
      return;
    }

    const modes = rules?.clock?.modes ?? [];
    const defStyle = rules?.clock?.defaultMode ?? modes[0]?.id ?? "";
    setClockStyle(defStyle);

    const modeObj = modes.find((m) => m.id === defStyle) ?? modes[0] ?? null;
    const presets = modeObj?.presets?.length ? modeObj.presets : [300, 600, 900, 1200, 1800];

    setPreset(presets[presets.length - 1] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  const timerOptions = useMemo(() => {
    if (!clockEnabled) return [];
    const modes = rules?.clock?.modes ?? [];
    const modeObj = modes.find((m) => m.id === clockStyle) ?? modes[0] ?? null;
    const presets = modeObj?.presets?.length ? modeObj.presets : [300, 600, 900, 1200, 1800];
    return presets.map((s) => ({ seconds: s, label: fmtClock(s) }));
  }, [clockEnabled, rules, clockStyle]);

  useEffect(() => {
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDraft() {
    setErr("");
    setMsg("");

    try {
      const lk = norm(leagueKey);
      const ta = norm(teamA);
      const tb = norm(teamB);

      if (!playedOn) throw new Error("Pick a date.");
      if (!lk) throw new Error("Pick a league.");
      if (!ta || !tb) throw new Error("Pick both teams.");
      if (ta === tb) throw new Error("Teams must be different.");

      const duration = clockEnabled ? Number(preset || 0) : 0;

      const row = {
        status: "draft",
        played_on: playedOn,

        league_key: lk,
        sport,
        level,
        mode,

        team_a1: ta,
        team_b1: tb,

        score_a: 0,
        score_b: 0,

        duration_seconds: duration,
        timer_running: false,
        timer_anchor_ts: null,
        timer_remaining_at_anchor: duration,
        timer_remaining_seconds: duration,
      };

      const { data, error } = await supabase
        .from("live_games")
        .insert([row])
        .select("id")
        .single();

      if (error) throw error;

      setMsg("✅ Draft created. Open it to enter score/stats and finalize.");
      await loadDrafts();
      window.location.href = `/post/${data.id}`;
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight">Post Games</div>
            <div className="mt-1 text-sm text-white/70">
              Create a past game as a <b>draft</b>, then finalize when ready.
            </div>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
          >
            Home
          </Link>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {msg ? (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            {msg}
          </div>
        ) : null}

        {/* Create draft */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-lg font-black">Create Past Game Draft</div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <div className="mb-1 text-slate-300">Date</div>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={playedOn}
                onChange={(e) => setPlayedOn(e.target.value)}
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-slate-300">League</div>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={leagueKey}
                onChange={(e) => setLeagueKey(e.target.value)}
              >
                <option value="sophomores">Sophomores</option>
                <option value="juniors">Juniors</option>
                <option value="seniors">Seniors</option>
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Sport</div>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
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
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
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
              <div className="mb-1 text-slate-300">Mode</div>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
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

            <div />

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Team A</div>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={teamA}
                onChange={(e) => setTeamA(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Team B</div>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={teamB}
                onChange={(e) => setTeamB(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            {clockEnabled ? (
              <>
                <label className="text-sm md:col-span-2">
                  <div className="mb-1 text-slate-300">Clock Style</div>
                  <select
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                    value={clockStyle}
                    onChange={(e) => setClockStyle(e.target.value)}
                  >
                    {(rules?.clock?.modes ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm md:col-span-2">
                  <div className="mb-1 text-slate-300">Timer Preset</div>
                  <select
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                    value={preset}
                    onChange={(e) => setPreset(Number(e.target.value))}
                  >
                    {timerOptions.map((t) => (
                      <option key={t.seconds} value={t.seconds}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </div>

          <button
            onClick={createDraft}
            className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-emerald-400"
          >
            Create Draft
          </button>
        </div>

        {/* Drafts list */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-black">Draft Games</div>
            <button
              onClick={loadDrafts}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {!drafts.length ? (
            <div className="mt-4 text-sm text-white/60">No drafts yet.</div>
          ) : (
            <div className="mt-4 grid gap-4">
              {drafts.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-white/60">
                        {g.played_on ?? new Date(g.created_at).toLocaleDateString()}
                      </div>
                      <div className="mt-1 text-xl font-black">
                        {g.team_a1} vs {g.team_b1}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        {g.league_key} • {g.sport} • Level {g.level} • {g.mode} •{" "}
                        <span className="font-bold text-yellow-300">draft</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                        <div className="text-xs text-white/60">Score</div>
                        <div className="mt-1 text-3xl font-black tabular-nums">
                          {Number(g.score_a || 0)} - {Number(g.score_b || 0)}
                        </div>
                      </div>

                      <Link
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-slate-950 hover:bg-emerald-400"
                        href={`/post/${g.id}`}
                      >
                        Open Draft
                      </Link>
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
