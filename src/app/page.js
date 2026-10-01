"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { useAppMode } from "@/lib/useAppMode";
import { getSportRules } from "@/lib/sportRules";
import { useConfirmDialog } from "@/lib/useConfirmDialog";
import { PageHeader, ScoreBug } from "@/components/ui";

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

// Simple stroke-based icons, one per sport -- purely decorative, no data behind them.
function SportIcon({ sport, color }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  const s = norm(sport);
  if (s === "hoop") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17" /><path d="M4.5 12h15" /><path d="M6 6.2c2.6 2 2.6 9.6 0 11.6" /><path d="M18 6.2c-2.6 2-2.6 9.6 0 11.6" /></svg>;
  if (s === "soccer") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.2l4 2.9-1.5 4.7h-5L8 10.1z" /><path d="M12 7.2V4.2" /><path d="M8 10.1L4.2 9.3" /><path d="M14.5 14.8l2.3 2.6" /><path d="M9.5 14.8l-2.3 2.6" /><path d="M16 10.1l3.8-.8" /></svg>;
  if (s === "softball") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8.5" /><path d="M6 5.5c2.3 2.6 2.3 10.4 0 13" /><path d="M18 5.5c-2.3 2.6-2.3 10.4 0 13" /></svg>;
  if (s === "kickball") return <svg width="24" height="24" viewBox="0 0 24 24" {...p} strokeWidth="1.8"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="8.6" r="0.9" fill={color} stroke="none" /><circle cx="9" cy="14" r="0.9" fill={color} stroke="none" /><circle cx="15" cy="14" r="0.9" fill={color} stroke="none" /></svg>;
  if (s === "volleyball") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5c3.6 2.2 3.6 15.3 0 17.5" /><path d="M4.6 8.5c4.6 1.6 10.2 1.6 14.8 0" /><path d="M4.6 15.5c4.6-1.6 10.2-1.6 14.8 0" /></svg>;
  if (s === "football") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><path d="M4.5 12c0-4.5 3.5-7.5 7.5-7.5s7.5 3 7.5 7.5-3.5 7.5-7.5 7.5S4.5 16.5 4.5 12z" /><path d="M8 12h8" /><path d="M10 10v4" /><path d="M12.7 10v4" /></svg>;
  if (s === "newcomb") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><circle cx="12" cy="9" r="4.3" /><path d="M4 19c1-2.6 3-4 4.6-4" /><path d="M20 19c-1-2.6-3-4-4.6-4" /><path d="M4 19h16" /></svg>;
  if (s === "speedball") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><circle cx="14.5" cy="12" r="6.5" /><path d="M2.5 9h4" /><path d="M2 12.2h5" /><path d="M2.5 15.4h4" /></svg>;
  if (s === "euro") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="6.5" height="5.5" rx="0.5" /><path d="M3 5.8h6.5M3 7.6h6.5M4.6 4v5.5M6.3 4v5.5M8 4v5.5" /><circle cx="16" cy="15" r="4.6" /></svg>;
  if (s === "hockey") return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><path d="M9 3.5l8 15" /><path d="M17 18.5c-2.4 0-3.6.9-4.4 2.2" /><ellipse cx="6" cy="18.3" rx="2.6" ry="1.5" /></svg>;
  return <svg width="24" height="24" viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8.5" /></svg>;
}

export default function HomePage() {
  const { season, session, isCW, blueName, whiteName } = useAppMode();
  const { confirmAsync, confirmModal } = useConfirmDialog();
  const [status, setStatus] = useState("Checking…");
  const [err, setErr] = useNotifyingErr();
  const [creating, setCreating] = useState(false);
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
  const [matchupType, setMatchupType] = useState("two_team"); // single | two_team

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

  // ---- compact UI state (visual only, no effect on game data) ----
  const [showSettings, setShowSettings] = useState(false);
  const [showMore, setShowMore] = useState(false);

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

    setStatus(error ? `Supabase error: ${error.message}` : "Connected");
    if (error) setErr(error.message);
  }

  async function loadTeamsFromPlayers() {
    // Color War: the only teams are Blue and White, camp-wide.
    if (isCW) {
      const unique = ["blue", "white"];
      setTeams(unique);
      setTeamA((prev) => (prev && unique.includes(norm(prev)) ? prev : "blue"));
      setTeamB((prev) => (prev && unique.includes(norm(prev)) ? prev : "white"));
      return;
    }
    const lk = norm(leagueKey);
    const query = matchupType === "crest_cup"
      ? supabase.from("players").select("team_name, league_id").eq("departed", false).limit(5000)
      : supabase.from("players").select("team_name, league_id").eq("league_id", lk).eq("departed", false).limit(5000);
    const { data, error } = await query;

    if (error) {
      // Sibling loaders (loadGames, ping) all surface a fetch error to the
      // counselor -- this one used to just return, leaving the Team A/B
      // pickers empty with nothing telling them why "Create Game" wouldn't
      // work.
      setErr(`Couldn't load teams: ${error.message}`);
      return;
    }

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
    // This page has no login -- anyone can load it and inspect the
    // response. Only fetch the fields actually rendered below (previously
    // select("*"), which also shipped `notes` (raw game-state JSON),
    // `timer_running`, `win_points_override`, and `is_staff_game` to any
    // anonymous visitor).
    const { data, error } = await supabase
      .from("live_games")
      .select("id, matchup_type, team_a1, team_a2, team_b1, team_b2, is_bowl_game, bowl_name, bowl_counts, created_at, league_key, sport, level, mode, status, score_a, score_b")
      .eq("season", season)
      .eq("session", session)
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
  }, [leagueKey, matchupType, isCW]);

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
    if (creating) return;
    setCreating(true);
    try {
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

      matchup_type: isCW ? "single" : matchupType,
      team_a1: norm(teamA),
      team_b1: norm(teamB),
      team_a2: (!isCW && matchupType === "two_team") ? norm(teamA2) : null,
      team_b2: (!isCW && matchupType === "two_team") ? norm(teamB2) : null,
      season,
      session,

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
    } finally {
      setCreating(false);
    }
  }

  async function deleteGame(id) {
    try {
      setErr("");
      const ok = await confirmAsync("Only allowed if the game is NOT finalized.", { title: "Delete this game?", confirmLabel: "Delete" });
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

  // one-line summary of the collapsed settings, purely for display
  const settingsSummary = [
    isCW || (matchupType !== "full_team" && matchupType !== "crest_cup") ? `Level ${String(level).toUpperCase()}` : null,
    matchupType !== "crest_cup" ? mode : null,
    clockEnabled ? (clockModes?.find((m) => m.id === clockStyle)?.label || "Countdown") : "No clock",
    clockEnabled ? (timerOptions.find((p) => p.seconds === preset)?.label || FALLBACK_TIMER_PRESETS[0].label) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const liveGamesNow = games.filter((g) => g.status === "active");

  const connected = status.startsWith("Connected");

  return (
    <div>
      {confirmModal}

      <PageHeader
        title="Scores"
        description="Start a game, score it live, and the whole camp sees it update."
        tall
        crest
        pos="50% 70%"
      >
        <span className="flex items-center gap-2 font-semibold text-[var(--ink-2)]" role="status">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: connected ? "var(--good)" : "var(--live)", boxShadow: connected ? "0 0 12px var(--good)" : "0 0 12px var(--live)" }} />
          {connected ? "Connected" : status}
        </span>
        <button onClick={loadGames} className="btn btn-secondary btn-sm">Refresh</button>
      </PageHeader>

      {/* Live now: the fastest route back into a game being scored. */}
      {liveGamesNow.length ? (
        <section className="mt-6" aria-label="Games live now">
          <div className="bc-section-head reveal">
            <h2>Live now</h2>
            <span className="bc-live-badge"><span className="bc-live-dot" aria-hidden="true" />{liveGamesNow.length} on air</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {liveGamesNow.map((g, i) => (
              <ScoreBug
                key={g.id}
                index={i}
                href={`/live/${g.id}`}
                status="live"
                a={{ name: norm(g.team_a1), score: g.score_a }}
                b={{ name: norm(g.team_b1), score: g.score_b }}
              >
                <span className="bc-label hidden sm:block">{g.sport}</span>
              </ScoreBug>
            ))}
          </div>
        </section>
      ) : null}

      {/* Create game */}
      <section className="bc-card bc-card-pad mt-5" aria-labelledby="new-game-h">
        <div className="bc-section-head"><h2 id="new-game-h">New game</h2></div>

        {/* Sport: horizontally scrolling chip strip, compact on phones */}
        <fieldset className="mt-4">
          <legend className="bc-select-label">Sport</legend>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
            {SPORTS.map((s, i) => {
              const active = norm(sport) === norm(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  disabled={matchupType === "crest_cup"}
                  onClick={() => setSport(s)}
                  className="bc-rise-in flex min-h-[72px] min-w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border-[1.5px] px-3 py-2 disabled:opacity-40"
                  style={{
                    "--stagger": i,
                    borderColor: active ? "var(--ink)" : "var(--ink-3)",
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "var(--on-ink)" : "var(--ink)",
                  }}
                >
                  <SportIcon sport={s} color="currentColor" />
                  <span className="text-xs font-bold">{s}</span>
                </button>
              );
            })}
          </div>
          {matchupType === "crest_cup" ? <div className="mt-1 text-sm text-[var(--ink-2)]">Crest Cup is Soccer only.</div> : null}
        </fieldset>

        {(norm(sport) === "volleyball" || norm(sport) === "newcomb") ? (
          <label className="mt-4 block">
            <span className="bc-select-label">Series format</span>
            <select
              className="bc-select"
              value={seriesFormatChoice}
              onChange={(e) => setSeriesFormatChoice(Number(e.target.value))}
            >
              <option value={3}>Best of 3</option>
              <option value={5}>Best of 5</option>
            </select>
          </label>
        ) : null}

        {/* League: hidden for Crest Cup */}
        {matchupType !== "crest_cup" ? (
          <div className="mt-4">
            <div className="bc-select-label" id="league-l">League</div>
            <div className="seg" role="group" aria-labelledby="league-l">
              {(leagues?.length
                ? leagues
                : [
                    { id: "seniors", name: "Seniors" },
                    { id: "juniors", name: "Juniors" },
                    { id: "sophomores", name: "Sophomores" },
                  ]
              ).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={leagueKey === l.id}
                  onClick={() => setLeagueKey(l.id)}
                >
                  {l.name ?? l.id}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-[var(--ink-2)]">Crest Cup spans all leagues, with no age group split.</div>
        )}

        {/* Team picks: in Color War these are locked to Blue vs White */}
        {isCW ? (
          <div className="mt-4 rounded-md border-[1.5px] border-[var(--ink)] p-4 text-center">
            <div className="bc-display text-3xl leading-none">
              {blueName} <span className="text-[var(--ink-3)]">vs</span> {whiteName}
            </div>
            <div className="mt-2 text-sm text-[var(--ink-2)]">Teams are set automatically for Color War.</div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
            <div className="grid gap-2">
              <label>
                <span className="bc-select-label">Team A{matchupType === "two_team" ? " · first" : ""}</span>
                <select className="bc-select" value={teamA} onChange={(e) => setTeamA(e.target.value)}>
                  <option value="">Select…</option>
                  {teams.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
              {matchupType === "two_team" ? (
                <label>
                  <span className="bc-select-label">Team A · second</span>
                  <select className="bc-select" value={teamA2} onChange={(e) => setTeamA2(e.target.value)}>
                    <option value="">Add second team…</option>
                    {teams.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="bc-display text-center text-2xl text-[var(--ink-3)] sm:pt-7" aria-hidden="true">vs</div>
            <div className="grid gap-2">
              <label>
                <span className="bc-select-label">Team B{matchupType === "two_team" ? " · first" : ""}</span>
                <select className="bc-select" value={teamB} onChange={(e) => setTeamB(e.target.value)}>
                  <option value="">Select…</option>
                  {teams.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
              {matchupType === "two_team" ? (
                <label>
                  <span className="bc-select-label">Team B · second</span>
                  <select className="bc-select" value={teamB2} onChange={(e) => setTeamB2(e.target.value)}>
                    <option value="">Add second team…</option>
                    {teams.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>
        )}

        {/* Auto-computed settings summary. Tap Edit to reveal Level / Mode / Clock controls */}
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          className="mt-4 flex min-h-[48px] w-full items-center justify-between gap-2 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3.5 text-left"
        >
          <span className="truncate text-sm font-semibold">{settingsSummary || "Game settings"}</span>
          <span className="shrink-0 text-sm font-extrabold underline underline-offset-4">{showSettings ? "Done" : "Edit"}</span>
        </button>

        {showSettings ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isCW || (matchupType !== "full_team" && matchupType !== "crest_cup") ? (
              <label>
                <span className="bc-select-label">Level</span>
                <select
                  className="bc-select"
                  value={String(level).toUpperCase()}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  {(availableLevels?.length ? availableLevels : FALLBACK_LEVELS).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </label>
            ) : matchupType === "full_team" ? (
              <div className="flex items-end pb-2 text-sm text-[var(--ink-2)]">Full Team has no level split.</div>
            ) : (
              <div className="flex items-end pb-2 text-sm text-[var(--ink-2)]">Crest Cup has no level split.</div>
            )}

            {matchupType !== "crest_cup" ? (
              <label>
                <span className="bc-select-label">Mode</span>
                <select
                  className="bc-select"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setModeDirty(true);
                  }}
                >
                  {MODES.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              </label>
            ) : (
              <div className="flex items-end pb-2 text-sm text-[var(--ink-2)]">Crest Cup uses the full camp-wide roster, with no fixed mode.</div>
            )}

            {clockEnabled ? (
              <label className="sm:col-span-2">
                <span className="bc-select-label">Clock style</span>
                <select
                  className="bc-select"
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
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="text-sm text-[var(--ink-2)] sm:col-span-2">This game has no clock.</div>
            )}

            {clockEnabled ? (
              <label className="sm:col-span-2">
                <span className="bc-select-label">Timer preset</span>
                <select
                  className="bc-select"
                  value={preset}
                  onChange={(e) => {
                    setPreset(Number(e.target.value));
                    setPresetDirty(true);
                  }}
                >
                  {(timerOptions.length ? timerOptions : FALLBACK_TIMER_PRESETS).map((p) => (
                    <option key={p.seconds} value={p.seconds}>{p.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {/* More options: matchup type + bowl game, hidden in Color War */}
        {!isCW ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="flex min-h-[48px] w-full items-center justify-between border-t border-[var(--rule)] text-left"
            >
              <span className="text-sm font-bold text-[var(--ink-2)]">More options</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={showMore ? "M3 10l5-5 5 5" : "M3 6l5 5 5-5"} />
              </svg>
            </button>

            {showMore ? (
              <div className="flex flex-col gap-3 pb-1">
                <label>
                  <span className="bc-select-label">Matchup</span>
                  <select
                    className="bc-select"
                    value={matchupType}
                    onChange={(e) => setMatchupType(e.target.value)}
                  >
                    <option value="single">1 team vs 1 team</option>
                    <option value="two_team">2 teams vs 2 teams</option>
                    <option value="full_team">Full Team</option>
                    <option value="crest_cup">Crest Cup (All Leagues)</option>
                  </select>
                </label>

                <div className="rounded-md border border-[var(--rule)] p-4">
                  <label className="flex min-h-[44px] items-center gap-3 text-base font-bold">
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
                    Bowl game
                  </label>

                  {isBowlGame ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label>
                        <span className="bc-select-label">Bowl name</span>
                        <input
                          value={bowlName}
                          onChange={(e) => setBowlName(e.target.value)}
                          placeholder="Session 1 Bowl"
                          className="bc-select"
                        />
                      </label>

                      <label>
                        <span className="bc-select-label">Counts for standings?</span>
                        <select
                          value={bowlCounts ? "yes" : "no"}
                          onChange={(e) => setBowlCounts(e.target.value === "yes")}
                          className="bc-select"
                        >
                          <option value="yes">Yes (normal points)</option>
                          <option value="no">No (exhibition)</option>
                        </select>
                      </label>

                      <div className="text-sm text-[var(--ink-2)] sm:col-span-2">
                        Bowl games are tagged for display. If you pick No, the game finalizes normally but does not change standings.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          onClick={createGame}
          disabled={!canCreate || creating}
          className="btn mt-4 w-full"
          style={{ minHeight: 56, fontSize: 18 }}
        >
          {creating ? "Creating…" : "Create game"}
        </button>

        {err ? <div role="alert" className="bc-error mt-3 text-sm">{err}</div> : null}
      </section>

      {/* Recent games */}
      <section className="mt-8" aria-labelledby="recent-h">
        <div className="bc-section-head reveal"><h2 id="recent-h">Recent games</h2></div>

        {games.length === 0 ? (
          <div className="bc-empty">
            <strong>No games yet</strong>
            Create one above and it will show up here.
          </div>
        ) : (
          <ul className="grid gap-x-5 gap-y-5 lg:grid-cols-2">
            {games.map((g, i) => {
              const left = g.matchup_type === "two_team" ? matchupLabel(g.team_a1, g.team_a2) : norm(g.team_a1);
              const right = g.matchup_type === "two_team" ? matchupLabel(g.team_b1, g.team_b2) : norm(g.team_b1);

              const bowlOn = !!g.is_bowl_game;
              const bowlLabel = String(g.bowl_name || "").trim();
              const counts = g.bowl_counts !== false;
              const isFinal = g.status === "final";

              return (
                <li key={g.id}>
                  <ScoreBug
                    index={Math.min(i, 8)}
                    href={`/live/${g.id}`}
                    status={isFinal ? "final" : "live"}
                    tag={isFinal ? "Final" : "Live"}
                    a={{ name: left, score: g.score_a }}
                    b={{ name: right, score: g.score_b }}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[15px] text-[var(--ink-2)]">
                    <span className="bc-label">{g.league_key} · {g.sport} · Level {g.level} · {g.mode}</span>
                    {bowlOn ? <span className="bc-chip">Bowl{bowlLabel ? `: ${bowlLabel}` : ""}</span> : null}
                    {bowlOn && !counts ? <span className="bc-chip">Exhibition</span> : null}
                    <span className="text-[var(--ink-3)]">{new Date(g.created_at).toLocaleString()}</span>
                    {!isFinal ? (
                      <button onClick={() => deleteGame(g.id)} className="btn btn-danger btn-sm ml-auto">Delete</button>
                    ) : (
                      <span className="ml-auto text-[var(--ink-3)]">Finalized, admin only</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
