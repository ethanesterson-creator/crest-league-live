"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const SPORTS = ["Hoop", "Soccer", "Softball", "Volleyball", "Football", "Speedball", "Euro", "Hockey"];
const LEVELS = ["A", "B", "C"];
const MODES = ["5v5", "6v6", "7v7", "8v8", "9v9", "10v10"];

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
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

  const [playedOn, setPlayedOn] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const [drafts, setDrafts] = useState([]);

  async function loadTeams(lk) {
    const { data, error } = await supabase
      .from("players")
      .select("team_name")
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
    const { data, error } = await supabase
      .from("live_games")
      .select("id, created_at, played_on, league_key, sport, level, mode, team_a1, team_b1, score_a, score_b, status")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error) setDrafts(data || []);
  }

  useEffect(() => {
    loadTeams(norm(leagueKey));
  }, [leagueKey]);

  useEffect(() => {
    loadDrafts();
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

      const row = {
        status: "draft",
        played_on: playedOn,

        league_key: lk,
        sport,
        level,
        mode,

        team_a1: ta,
        team_b1: tb,

        // start at 0, but we’ll edit with inputs on the draft page
        score_a: 0,
        score_b: 0,
      };

      const { data, error } = await supabase.from("live_games").insert([row]).select("id").single();
      if (error) throw error;

      setMsg("✅ Draft created.");
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
              Create a past game as a <b>draft</b>, enter score (stats optional), then finalize.
            </div>
          </div>

          <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10">
            Home
          </Link>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div>
        ) : null}

        {msg ? (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{msg}</div>
        ) : null}

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
                  <option key={s} value={s}>{s}</option>
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
                  <option key={l} value={l}>{l}</option>
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
                  <option key={m} value={m}>{m}</option>
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
                  <option key={t} value={t}>{t}</option>
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
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={createDraft}
            className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-emerald-400"
          >
            Create Draft
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-black">Draft Games</div>
            <button
              onClick={loadDrafts}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Refresh
            </button>
          </div>

          {!drafts.length ? (
            <div className="mt-4 text-sm text-white/60">No drafts yet.</div>
          ) : (
            <div className="mt-4 grid gap-4">
              {drafts.map((g) => (
                <Link
                  key={g.id}
                  href={`/post/${g.id}`}
                  className="block rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
                >
                  <div className="text-xs text-white/60">{g.played_on ?? "—"}</div>
                  <div className="mt-1 text-xl font-black">{g.team_a1} vs {g.team_b1}</div>
                  <div className="mt-1 text-sm text-white/70">
                    {g.league_key} • {g.sport} • Level {g.level} • {g.mode} • <span className="text-yellow-300 font-bold">draft</span>
                  </div>
                  <div className="mt-2 text-2xl font-black tabular-nums">
                    {Number(g.score_a || 0)} - {Number(g.score_b || 0)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
