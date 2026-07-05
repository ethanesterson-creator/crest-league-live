"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

const SPORTS = [
  "Hoop",
  "Softball",
  "Kickball",
  "Volleyball",
  "Football",
  "Newcomb",
  "Speedball",
  "Euro",
  "Soccer",
  "Hockey",
];

// Fallbacks only used if points_rules row is missing
const FALLBACK_LEVELS = ["A", "B", "C", "D", "E", "F"];
const MODES = ["5v5", "6v6", "7v7", "8v8", "9v9", "10v10", "11v11", "3v3", "2v2", "1v1"];

const FALLBACK_TIMER_PRESETS = [
  { label: "30:00", seconds: 1800 },
  { label: "25:00", seconds: 1500 },
  { label: "20:00", seconds: 1200 },
  { label: "15:00", seconds: 900 },
  { label: "12:00", seconds: 720 },
  { label: "10:00", seconds: 600 },
  { label: "08:00", seconds: 480 },
  { label: "07:00", seconds: 420 },
  { label: "05:00", seconds: 300 },
  { label: "04:00", seconds: 240 },
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
  const { data, error } = await supabase.from("leagues").select("id, name").order("id", { ascending: true });

  if (error) {
    setLeagues([
      { id: "seniors", name: "Seniors" },
      { id: "juniors", name: "Juniors" },
      { id: "sophomores", name: "Sophomores" },
    ]);
    return;
  }

  setLeagues(data ?? []);
}

function uniqNonEmpty(arr) {
  return Array.from(new Set(arr.map((x) => norm(x)).filter(Boolean)));
}

function matchupLabel(a1, a2) {
  const x1 = norm(a1);
  const x2 = norm(a2);
  if (x1 && x2 && x1 !== x2) return `${x1} + ${x2}`;
  return x1 || "—";
}

export default function HomePage() {
  const [status, setStatus] = useState("Checking…");
  const [err, setErr] = useState("");
  const [games, setGames] = useState([]);

  const [leagues, setLeagues] = useState([]);

  // form
  const [leagueKey, setLeagueKey] = useState("seniors");
  const [sport, setSport] = useState("Hoop");

  // available levels based on points_rules
  const [availableLevels, setAvailableLevels] = useState(FALLBACK_LEVELS);
  const [level, setLevel] = useState("A");

  // mode defaulted from points_rules
  const [mode, setMode] = useState("5v5");
  const [modeDirty, setModeDirty] = useState(false);

  // matchup type
  const [matchupType, setMatchupType] = useState("single"); // single | two_team

  // Crest Cup only ever uses Soccer — lock it automatically, and use a generic mode label
  useEffect(() => {
    if (matchupType === "crest_cup") {
      setSport("Soccer");
      setMode("Crest Cup");
      setModeDirty(true);
    }
  }, [matchupType]);

  // sport rules (fallback presets)
  const rules = useMemo(() => getSportRules(sport), [sport]);
  const clockModes = useMemo(() => rules?.clock?.modes ?? [], [rules]);

  // clock config (defaulted from points_rules, fallback to sport rules)
  const [clockEnabled, setClockEnabled] = useState(!!rules?.clock?.enabled);
  const [clockStyle, setClockStyle] = useState("");
  const [clockStyleDirty, setClockStyleDirty] = useState(false);

  const [preset, setPreset] = useState(FALLBACK_TIMER_PRESETS[0].seconds);
  const [presetDirty, setPresetDirty] = useState(false);

  // teams from players table
  const [teams, setTeams] = useState([]);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");

  // extra teams for 2-team matchup
  const [teamA2, setTeamA2] = useState("");
  const [teamB2, setTeamB2] = useState("");

  // -------------------------
  // BOWL GAME FIELDS
  // -------------------------
  const [isBowlGame, setIsBowlGame] = useState(false);
  const [seriesFormatChoice, setSeriesFormatChoice] = useState(3);
  const [bowlName, setBowlName] = useState("");
  const [bowlCounts, setBowlCounts] = useState(true);

  // ---- points_rules helpers ----
  async function fetchRuleRow(lk, sp, lv) {
    const league_id = norm(lk);
    const sport_key = norm(sp); // points_rules sport is lowercase
    const level_key = String(lv || "").trim().toUpperCase();

    if (!league_id || !sport_key || !level_key) return null;

    const { data, error } = await supabase
      .from("points_rules")
      .select(
        "league_id,sport,level,default_mode,clock_enabled,default_clock_style,default_clock_seconds,players_per_team,score_buttons,stat_keys,win_points"
      )
      .eq("league_id", league_id)
      .eq("sport", sport_key)
      .eq("level", level_key)
      .maybeSingle();

    if (error) return null;
    return data ?? null;
  }

  async function loadAvailableLevels() {
    const league_id = norm(leagueKey);
    const sport_key = norm(sport);

    if (!league_id || !sport_key) {
      setAvailableLevels(FALLBACK_LEVELS);
      return;
    }

    const { data, error } = await supabase.from("points_rules").select("level").eq("league_id", league_id).eq("sport", sport_key);

    if (error) {
      setAvailableLevels(FALLBACK_LEVELS);
      return;
    }

    const uniq = Array.from(new Set((data || []).map((r) => String(r.level || "").trim().toUpperCase()).filter(Boolean)));

    // Sort levels in a sensible order
    const order = { A: 1, B: 2, C: 3, D: 4, ALL: 99 };
    uniq.sort((a, b) => (order[a] ?? 50) - (order[b] ?? 50));

    setAvailableLevels(uniq.length ? uniq : FALLBACK_LEVELS);
  }

  // Reload level list whenever league or sport changes
  useEffect(() => {
    loadAvailableLevels();
    // reset "dirty" overrides because the selection context changed
    setModeDirty(false);
    setClockStyleDirty(false);
    setPresetDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueKey, sport]);

  // Keep level in sync with whatever levels actually exist for this league+sport.
  // (Evening Activity used to force level="ALL" here — removed; evening activity
  // results now go through real sport games or Non-Game Points instead.)
  useEffect(() => {
    if (String(level).toUpperCase() === "ALL") {
      setLevel(availableLevels?.length ? availableLevels[0] : "A");
    } else if (availableLevels?.length && !availableLevels.includes(String(level).toUpperCase())) {
      setLevel(availableLevels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, availableLevels]);

  // Apply defaults from points_rules whenever league/sport/level changes
  useEffect(() => {
    (async () => {
      const lv = String(level || "").trim().toUpperCase();
      if (!lv) return;

      const row = await fetchRuleRow(leagueKey, sport, lv);

      // If no rule row, fall back to sport rules behavior
      if (!row) {
        const fallbackClockEnabled = !!rules?.clock?.enabled;
        setClockEnabled(fallbackClockEnabled);

        if (!fallbackClockEnabled) {
          setClockStyle("");
          setPreset(0);
          return;
        }

        const fallbackStyle = rules?.clock?.defaultMode || (clockModes.length ? clockModes[0].id : "countdown");
        if (!clockStyleDirty) setClockStyle(fallbackStyle);

        const modeObj = clockModes.find((m) => m.id === fallbackStyle) ?? clockModes[0] ?? null;
        const presets = modeObj?.presets?.length ? modeObj.presets : FALLBACK_TIMER_PRESETS.map((p) => p.seconds);

        if (!presetDirty) setPreset(presets[presets.length - 1] ?? 1800);
        return;
      }

      // ✅ Apply defaults from DB (unless user has overridden)
      if (!modeDirty && row.default_mode) setMode(row.default_mode);

      const dbClockEnabled = row.clock_enabled === true;
      setClockEnabled(dbClockEnabled);

      if (!dbClockEnabled) {
        setClockStyle("");
        setPreset(0);
        return;
      }

      const dbStyle = row.default_clock_style || "countdown";
      if (!clockStyleDirty) setClockStyle(dbStyle);

      const dbSeconds = Number(row.default_clock_seconds ?? 0);
      if (!presetDirty && dbSeconds > 0) setPreset(dbSeconds);

      // If dbSeconds is 0 but clock is enabled, fall back to some preset
      if (!presetDirty && !(dbSeconds > 0)) {
        const modeObj = clockModes.find((m) => m.id === dbStyle) ?? clockModes[0] ?? null;
        const presets = modeObj?.presets?.length ? modeObj.presets : FALLBACK_TIMER_PRESETS.map((p) => p.seconds);
        setPreset(presets[presets.length - 1] ?? 1800);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueKey, sport, level]);

  const timerOptions = useMemo(() => {
    if (!clockEnabled) return [];

    const modeObj = clockModes.find((m) => m.id === clockStyle) ?? clockModes[0] ?? null;

    const secondsList = modeObj?.presets?.length ? modeObj.presets : FALLBACK_TIMER_PRESETS.map((p) => p.seconds);

    // Ensure the DB default is present in list
    const list = Array.from(new Set([...secondsList, Number(preset || 0)].filter((n) => n > 0)));

    // Convert to {label, seconds}
    return list
      .sort((a, b) => a - b)
      .map((s) => ({ seconds: s, label: fmtClock(s) }));
  }, [clockEnabled, clockModes, clockStyle, preset]);

  async function ping() {
    setErr("");
    const { error } = await supabase.from("live_games").select("id").is("played_on", null).limit(1);

    setStatus(error ? `Supabase error: ${error.message}` : "Connected ✅");
    if (error) setErr(error.message);
  }

  async function loadTeamsFromPlayers() {
    const lk = norm(leagueKey);
    const query = matchupType === "crest_cup"
      ? supabase.from("players").select("team_name, league_id").limit(5000)
      : supabase.from("players").select("team_name, league_id").eq("league_id", lk).limit(5000);
    const { data, error } = await query;

    if (error) return;

    const unique = Array.from(new Set((data || []).map((r) => norm(r.team_name)).filter(Boolean))).sort();

    setTeams(unique);

    setTeamA((prev) => (prev && unique.includes(norm(prev)) ? prev : unique[0] || ""));
    setTeamB((prev) => (prev && unique.includes(norm(prev)) ? prev : unique[1] || ""));

    // defaults for extra teams (2-team)
    setTeamA2((prev) => (prev && unique.includes(norm(prev)) ? prev : unique[2] || ""));
    setTeamB2((prev) => (prev && unique.includes(norm(prev)) ? prev : unique[3] || ""));
  }

  async function loadGames() {
    setErr("");
    const { data, error } = await supabase
      .from("live_games")
      .select("*")
      .neq("status", "draft")
      .is("played_on", null) // ✅ only LIVE games
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
  }, [leagueKey, matchupType]);

  // Validation
  const canCreate = useMemo(() => {
    const lk = norm(leagueKey);
    const a1 = norm(teamA);
    const b1 = norm(teamB);

    if (matchupType !== "crest_cup" && !lk) return false;
    if (!a1 || !b1) return false;
    if (a1 === b1) return false;

    if (matchupType === "single") return true;
    if (matchupType === "full_team") return true;
    if (matchupType === "crest_cup") return true;

    const a2 = norm(teamA2);
    const b2 = norm(teamB2);

    if (!a2 || !b2) return false;

    const picks = [a1, a2, b1, b2];
    const uniq = new Set(picks);
    return uniq.size === picks.length;
  }, [leagueKey, teamA, teamA2, teamB, teamB2, matchupType]);

  async function createGame() {
    setErr("");

    if (!canCreate) {
      setErr(matchupType === "two_team" ? "Pick 4 different teams (A1, A2, B1, B2). No duplicates." : "Pick two different teams.");
      return;
    }

    // Bowl validation
    if (isBowlGame && bowlName.trim().length === 0) {
      setErr("Enter a Bowl name (example: 'Session 1 Bowl').");
      return;
    }

    const duration = clockEnabled ? Number(preset || 0) : 0;

    const finalLevel = matchupType === "full_team" ? "FULL" : matchupType === "crest_cup" ? "A" : String(level).toUpperCase();

    if (matchupType === "two_team" && finalLevel === "FULL") {
      setErr("FULL level is only for Full Team matchups. Pick A, B, C, or D for a 2v2 team game.");
      return;
    }
    const finalLeagueKey = matchupType === "crest_cup" ? "crest_cup" : norm(leagueKey);

    // Hard safety net: confirm a real points_rules row exists for the exact
    // league/sport/level we're about to save, BEFORE creating the game.
    // This closes off every possible path to an invalid level (not just the
    // old Evening Activity bug) — if this check fails, the game is never
    // created, instead of being created broken and discovered at finalize time.
    if (finalLeagueKey !== "crest_cup") {
      const { data: ruleCheck, error: ruleCheckErr } = await supabase
        .from("points_rules")
        .select("win_points")
        .eq("league_id", finalLeagueKey)
        .eq("sport", norm(sport))
        .eq("level", finalLevel)
        .maybeSingle();

      if (ruleCheckErr) {
        setErr(`Could not verify points rules: ${ruleCheckErr.message}`);
        return;
      }
      if (!ruleCheck) {
        setErr(`No points rules exist for ${finalLeagueKey} / ${sport} / level ${finalLevel}. Pick a different level or sport, or ask Ethan to add this combination in Supabase before creating the game.`);
        return;
      }
    }

    const payload = {
      league_key: finalLeagueKey,
      sport, // keep display value
      level: finalLevel,
      mode,

      matchup_type: matchupType,
      team_a1: norm(teamA),
      team_b1: norm(teamB),
      team_a2: matchupType === "two_team" ? norm(teamA2) : null,
      team_b2: matchupType === "two_team" ? norm(teamB2) : null,

      score_a: 0,
      score_b: 0,

      // timer fields
      duration_seconds: duration,
      timer_running: false,
      timer_anchor_ts: null,
      timer_remaining_seconds: duration,
      timer_remaining_at_anchor: duration,

      clock_style: clockEnabled ? clockStyle || "countdown" : "none",

      status: "active",
      notes: (norm(sport) === "volleyball" || norm(sport) === "newcomb")
        ? JSON.stringify({ series_format: seriesFormatChoice, series_a: 0, series_b: 0 })
        : "",

      // ✅ bowl fields
      is_bowl_game: !!isBowlGame,
      bowl_name: isBowlGame ? bowlName.trim() : null,
      bowl_counts: isBowlGame ? !!bowlCounts : true,
    };

    const { data, error } = await supabase.from("live_games").insert(payload).select("*").single();

    if (error) {
      setErr(error.message);
      return;
    }

    await loadGames();
    window.location.href = `/live/${data.id}`;
  }

  async function deleteGame(id) {
    try {
      setErr("");
      const ok = confirm("Delete this game? (Only allowed if NOT finalized)");
      if (!ok) return;

      const { error } = await supabase.rpc("delete_unfinalized_game", { gid: id });
      if (error) throw error;

      await loadGames();
    } catch (e) {
      const msg = e?.message ?? String(e);
      if (msg.toLowerCase().includes("cannot delete finalized")) {
        setErr("This game is finalized and can only be deleted by admin.");
      } else {
        setErr(msg);
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
            {matchupType !== "crest_cup" ? (
            <label className="text-sm">
              <div className="mb-1 text-slate-300">League (age group)</div>

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
            </label>
            ) : (
              <div className="text-xs text-slate-400 flex items-end pb-2">Crest Cup — spans all leagues, no age group split.</div>
            )}

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Sport</div>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500 disabled:opacity-50"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                disabled={matchupType === "crest_cup"}
              >
                {SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {matchupType === "crest_cup" ? (
                <div className="mt-1 text-xs text-slate-400">Crest Cup is Soccer only.</div>
              ) : null}
            </label>

            {(norm(sport) === "volleyball" || norm(sport) === "newcomb") ? (
              <label className="text-sm">
                <div className="mb-1 text-slate-300">Series Format</div>
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={seriesFormatChoice}
                  onChange={(e) => setSeriesFormatChoice(Number(e.target.value))}
                >
                  <option value={3}>Best of 3</option>
                  <option value={5}>Best of 5</option>
                </select>
              </label>
            ) : null}

            {/* Matchup type */}
            <label className="text-sm">
              <div className="mb-1 text-slate-300">Matchup</div>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={matchupType}
                onChange={(e) => setMatchupType(e.target.value)}
              >
                <option value="single">1 team vs 1 team</option>
                <option value="two_team">2 teams vs 2 teams</option>
                <option value="full_team">Full Team</option>
                <option value="crest_cup">Crest Cup (All Leagues)</option>
              </select>
            </label>

            {matchupType !== "full_team" && matchupType !== "crest_cup" ? (
            <label className="text-sm">
            <div className="mb-1 text-slate-300">Level</div>
           <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
              value={String(level).toUpperCase()}
              onChange={(e) => setLevel(e.target.value)}
               >
               {(availableLevels?.length ? availableLevels : FALLBACK_LEVELS).map((l) => (
                  <option key={l} value={l}>
                  {l}
                </option>
                  ))}
                  </select>
                 </label>
                ) : matchupType === "full_team" ? (
                 <div className="text-xs text-slate-400 flex items-end pb-2">Full Team — no level split.</div>
                  ) : (
                 <div className="text-xs text-slate-400 flex items-end pb-2">Crest Cup — no level split.</div>
                  )}

            {matchupType !== "crest_cup" ? (
            <label className="text-sm">
              <div className="mb-1 text-slate-300">Mode</div>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setModeDirty(true);
                }}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            ) : (
              <div className="text-xs text-slate-400 flex items-end pb-2">Crest Cup — full camp-wide roster, no fixed mode.</div>
            )}

            {/* ✅ Bowl controls */}
            <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4">
              <label className="flex items-center gap-3 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={isBowlGame}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setIsBowlGame(on);
                    if (!on) {
                      setBowlName("");
                      setBowlCounts(true);
                    }
                  }}
                />
                Bowl game?
              </label>

              {isBowlGame ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <div className="mb-1 text-slate-300">Bowl name</div>
                    <input
                      value={bowlName}
                      onChange={(e) => setBowlName(e.target.value)}
                      placeholder="Session 1 Bowl"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-slate-300">Counts for standings?</div>
                    <select
                      value={bowlCounts ? "yes" : "no"}
                      onChange={(e) => setBowlCounts(e.target.value === "yes")}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                    >
                      <option value="yes">Yes (normal points)</option>
                      <option value="no">No (exhibition)</option>
                    </select>
                  </label>

                  <div className="text-xs text-slate-400 sm:col-span-2">
                    Bowl games are tagged for display. If “No,” the game finalizes normally but does not change standings.
                  </div>
                </div>
              ) : null}
            </div>

            {/* Team picks */}
            <label className="text-sm">
              <div className="mb-1 text-slate-300">Team A1</div>
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
            </label>

            {matchupType === "two_team" ? (
              <>
                <label className="text-sm">
                  <div className="mb-1 text-slate-300">Team A2</div>
                  <select
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                    value={teamA2}
                    onChange={(e) => setTeamA2(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {teams.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <label className="text-sm">
              <div className="mb-1 text-slate-300">Team B1</div>
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

            {matchupType === "two_team" ? (
              <>
                <label className="text-sm">
                  <div className="mb-1 text-slate-300">Team B2</div>
                  <select
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                    value={teamB2}
                    onChange={(e) => setTeamB2(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {teams.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            {/* Clock Style */}
            {clockEnabled ? (
              <label className="text-sm sm:col-span-2">
                <div className="mb-1 text-slate-300">Clock Style</div>
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={clockStyle}
                  onChange={(e) => {
                    setClockStyle(e.target.value);
                    setClockStyleDirty(true);
                  }}
                >
                  {(clockModes?.length
                    ? clockModes
                    : [
                        {
                          id: "countdown",
                          label: "Countdown",
                          presets: FALLBACK_TIMER_PRESETS.map((p) => p.seconds),
                        },
                      ]
                  ).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="text-xs text-slate-400 sm:col-span-2">This game has no clock (per points_rules).</div>
            )}

            {/* Timer Preset */}
            {clockEnabled ? (
              <label className="text-sm sm:col-span-2">
                <div className="mb-1 text-slate-300">Timer Preset</div>
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={preset}
                  onChange={(e) => {
                    setPreset(Number(e.target.value));
                    setPresetDirty(true);
                  }}
                >
                  {(timerOptions.length ? timerOptions : FALLBACK_TIMER_PRESETS).map((p) => (
                    <option key={p.seconds} value={p.seconds}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <button
            onClick={createGame}
            disabled={!canCreate}
            className={`mt-4 w-full rounded-2xl px-4 py-3 text-lg font-extrabold shadow
              ${canCreate ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-slate-800 text-slate-400"}`}
          >
            Create Game
          </button>

          {err ? <div className="mt-3 rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{err}</div> : null}
        </div>

        {/* Recent games */}
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 text-lg font-bold">Recent Live Games</div>

          {games.length === 0 ? (
            <div className="text-sm text-slate-400">No games yet.</div>
          ) : (
            <div className="space-y-3">
              {games.map((g) => {
                const left = g.matchup_type === "two_team" ? matchupLabel(g.team_a1, g.team_a2) : norm(g.team_a1);
                const right = g.matchup_type === "two_team" ? matchupLabel(g.team_b1, g.team_b2) : norm(g.team_b1);

                const bowlOn = !!g.is_bowl_game;
                const bowlLabel = String(g.bowl_name || "").trim();
                const counts = g.bowl_counts !== false;

                return (
                  <div key={g.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-400">{new Date(g.created_at).toLocaleString()}</div>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <div className="text-xl font-extrabold">
                            {left} vs {right}
                          </div>

                          {bowlOn ? (
                            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-black text-amber-100">
                              BOWL{bowlLabel ? `: ${bowlLabel}` : ""}
                            </span>
                          ) : null}

                          {bowlOn && !counts ? (
                            <span className="rounded-full border border-slate-400/30 bg-slate-500/10 px-2 py-0.5 text-[11px] font-black text-slate-100">
                              EXHIBITION
                            </span>
                          ) : null}
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
                          <Link className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-slate-950 hover:bg-emerald-400" href={`/live/${g.id}`}>
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}