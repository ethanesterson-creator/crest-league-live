"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { notifyGameFinalized } from "@/lib/notifyGame";
import { getSportRules } from "@/lib/sportRules";

// ────────────────────────────────────────────────────────────────────────────
// Helpers (module scope — never recreated on render)
// ────────────────────────────────────────────────────────────────────────────
function norm(s) { return String(s ?? "").trim().toLowerCase(); }

function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds ?? 0)));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function parseMMSS(input) {
  const m = String(input ?? "").trim().match(/^(\d{1,3}):([0-5]\d)$/);
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

// Compute clock remaining at call time — no state needed
function computeRemaining(game) {
  if (!game) return 0;
  const running  = !!game.timer_running;
  const anchorTs = Number(game.timer_anchor_ts ?? 0);
  const atAnchor = Number(game.timer_remaining_at_anchor ?? game.timer_remaining_seconds ?? 0);
  if (running && anchorTs > 0) {
    return Math.max(0, atAnchor - (Date.now() / 1000 - anchorTs));
  }
  return Number(game.timer_remaining_seconds ?? atAnchor ?? 0);
}

const isSoftball     = (s) => norm(s) === "softball";
const isBattingSport = (s) => ["softball", "kickball"].includes(norm(s));
const isSeriesSport  = (s) => ["volleyball", "newcomb"].includes(norm(s));
const GOAL_AUTO_SCORE_SPORTS = ["euro", "soccer", "hockey", "speedball"];

const AT_BAT_OUTCOMES = [
  { key: "1b",  label: "1B",  statKey: "h",  color: "emerald", isOut: false },
  { key: "2b",  label: "2B",  statKey: "h",  color: "emerald", isOut: false },
  { key: "3b",  label: "3B",  statKey: "h",  color: "emerald", isOut: false },
  { key: "hr",  label: "HR",  statKey: "hr", color: "amber",   isOut: false },
  { key: "bb",  label: "BB",  statKey: null, color: "blue",    isOut: false },
  { key: "hbp", label: "HBP", statKey: null, color: "blue",    isOut: false },
  { key: "k",   label: "K",   statKey: null, color: "red",     isOut: true  },
  { key: "bk",  label: "ꓘ",   statKey: null, color: "red",     isOut: true  },
  { key: "go",  label: "GO",  statKey: null, color: "red",     isOut: true  },
  { key: "fo",  label: "FO",  statKey: null, color: "red",     isOut: true  },
  { key: "sf",  label: "SF",  statKey: null, color: "red",     isOut: true  },
  { key: "dp",  label: "DP",  statKey: null, color: "red",     isOut: true, outs: 2 },
  { key: "e",   label: "E",   statKey: null, color: "orange",  isOut: false },
  { key: "fc",  label: "FC",  statKey: null, color: "orange",  isOut: true  },
];

const OUTCOME_COLORS = {
  emerald: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 active:bg-emerald-500/40",
  amber:   "border-amber-400/40 bg-amber-500/15 text-amber-200 active:bg-amber-500/40",
  blue:    "border-blue-400/40 bg-blue-500/15 text-blue-200 active:bg-blue-500/40",
  red:     "border-red-500/40 bg-red-500/15 text-red-300 active:bg-red-500/40",
  orange:  "border-orange-400/40 bg-orange-500/15 text-orange-200 active:bg-orange-500/40",
};

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
    ? supabase.from("players").select("id, role, team_name").in("team_name", teamNames).eq("departed", false)
    : supabase.from("players").select("id, role, team_name").eq("league_id", leagueId).in("team_name", teamNames).eq("departed", false);
  const { data } = await query;
  const ids = new Set();
  for (const p of data || []) if (String(p.role || "").toLowerCase().includes("captain")) ids.add(String(p.id));
  return ids;
}

// Full-word captions for stat abbreviations — display only, never touches
// the stored stat_key. Falls back to the abbreviation itself if unlisted.
const STAT_CAPTIONS = {
  g: "Goal", a: "Assist", pts: "Points", foul: "Foul",
  td: "Touchdown", h: "Hit", hr: "Home Run",
};
function statCaption(key, fallbackLabel) {
  return STAT_CAPTIONS[norm(key)] || fallbackLabel || key;
}

// ────────────────────────────────────────────────────────────────────────────
// ClockButton — the ONLY thing that ticks. Isolated so the rest of the page
// never re-renders on clock updates. This was the core cause of eaten taps:
// the old page re-rendered (and remounted every button) 4 times per second.
// ────────────────────────────────────────────────────────────────────────────
function ClockButton({ game, onOpen, big }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!game?.timer_running) return;
    const t = setInterval(() => force((v) => v + 1), 250);
    return () => clearInterval(t);
  }, [game?.timer_running]);
  return (
    <button onClick={onOpen}
      className={big
        ? "touch-manipulation select-none rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-3xl font-black tabular-nums text-white active:scale-[0.98]"
        : "touch-manipulation select-none rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xl font-black tabular-nums text-white active:scale-[0.98]"}>
      {fmtClock(computeRemaining(game))}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Row components — module scope so React preserves their DOM across renders.
// Defined-inside-parent components get remounted on every parent render,
// which destroys buttons mid-tap. Never again.
// ────────────────────────────────────────────────────────────────────────────
const BTN = "touch-manipulation select-none";

// Every stat gets its own full-width card: real word caption, big count,
// -1 plus each configured delta, all buttons min-h-11 (44px) for reliable
// thumb taps. Replaces the old thin abbreviation-only chip row.
function StatChip({ p, sd, side, value, onBump, onUndo }) {
  const deltas = sd?.deltas?.length ? sd.deltas : [1];
  return (
    <div className="min-w-[140px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider text-white/50">{statCaption(sd.key, sd.label)}</span>
        <span className="text-xl font-black tabular-nums text-white">{value}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        <button onClick={() => onUndo(p, sd, side)} disabled={value <= 0}
          className={`${BTN} min-h-11 flex-1 rounded-lg border border-red-500/30 bg-red-500/10 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20`}>-1</button>
        {deltas.map((d) => (
          <button key={d} onClick={() => onBump(p, sd, side, d)}
            className={`${BTN} min-h-11 flex-1 rounded-lg border border-white/10 bg-white/10 text-sm font-black active:scale-95`}>+{d}</button>
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ p, idx, total, side, showBatting, isCap, statDefs, getVal, onBumpChip, onUndoChip, onToggle, onMove }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        {showBatting ? (
          <div className="flex shrink-0 items-center gap-1">
            <span className="w-5 text-center text-[10px] font-black opacity-60">{idx + 1}</span>
            <button onClick={() => onMove(p, "up")} disabled={idx === 0} className={`${BTN} min-h-11 min-w-11 rounded-lg border border-white/10 bg-white/10 text-xs font-black disabled:opacity-30`}>↑</button>
            <button onClick={() => onMove(p, "down")} disabled={idx === total - 1} className={`${BTN} min-h-11 min-w-11 rounded-lg border border-white/10 bg-white/10 text-xs font-black disabled:opacity-30`}>↓</button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-white">{isCap ? "⭐ " : ""}{p.player_name || p.player_id}</div>
        </div>
        <button onClick={() => onToggle(p)}
          className={`${BTN} min-h-11 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 text-xs font-black text-red-300 active:scale-95`}>Out</button>
      </div>
      {statDefs.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {statDefs.map((sd) => (
            <StatChip key={`${p.player_id}-${sd.key}`} p={p} sd={sd} side={side}
              value={getVal(p.player_id, sd.key)}
              onBump={onBumpChip} onUndo={onUndoChip} />
          ))}
        </div>
      )}
    </div>
  );
}

function HoopPlayerRow({ p, side, isCap, pts, fouls, onBumpPts, onUndoPts, onBumpFoul, onUndoFoul, onToggle }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-white">{isCap ? "⭐ " : ""}{p.player_name || p.player_id}</div>
        </div>
        <button onClick={() => onToggle(p)}
          className={`${BTN} min-h-11 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 text-xs font-black text-red-300 active:scale-95`}>Out</button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <div className="min-w-[180px] flex-[2] rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Points</span>
            <span className="text-xl font-black tabular-nums text-white">{pts}</span>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => onUndoPts(p, side)} disabled={pts <= 0}
              className={`${BTN} min-h-11 flex-1 rounded-lg border border-red-500/30 bg-red-500/10 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20`}>-1</button>
            {[1, 2, 3].map((d) => (
              <button key={d} onClick={() => onBumpPts(p, side, d)}
                className={`${BTN} min-h-11 flex-1 rounded-lg border border-white/10 bg-white/10 text-sm font-black active:scale-95`}>+{d}</button>
            ))}
          </div>
        </div>
        <div className="min-w-[140px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Fouls</span>
            <span className="text-xl font-black tabular-nums text-white">{fouls}</span>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => onUndoFoul(p)} disabled={fouls <= 0}
              className={`${BTN} min-h-11 flex-1 rounded-lg border border-red-500/30 bg-red-500/10 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20`}>-1</button>
            <button onClick={() => onBumpFoul(p)}
              className={`${BTN} min-h-11 flex-1 rounded-lg border border-white/10 bg-white/10 text-sm font-black active:scale-95`}>+1</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BenchRow({ p, isCap, onToggle }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <span className="truncate text-sm font-semibold text-white/60">{isCap ? "⭐ " : ""}{p.player_name || p.player_id}</span>
      <button onClick={() => onToggle(p)}
        className={`${BTN} min-h-11 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-black text-emerald-300 active:scale-95`}>In</button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────
export default function LiveGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params?.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [game, setGame]       = useState(null);
  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);
  const [statTotals, setStatTotals] = useState({});
  const [captainIds, setCaptainIds] = useState(new Set());

  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [clockMode, setClockMode]     = useState("");
  const [showBenchA, setShowBenchA]   = useState(false);
  const [showBenchB, setShowBenchB]   = useState(false);
  // Which team's roster is showing full-width below the scoreboard —
  // one team at a time instead of squeezing both into half-width columns.
  const [activeRosterSide, setActiveRosterSide] = useState("A");
  const [showTopBar, setShowTopBar]   = useState(true);
  const [setTimeOpen, setSetTimeOpen] = useState(false);
  const [timeInput, setTimeInput]     = useState("00:00");
  const [isOnline, setIsOnline]       = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const [inning, setInning]           = useState(1);
  const [inningHalf, setInningHalf]   = useState("top");
  // Period/quarter counter for clocked sports. Hockey = 3 periods,
  // Speedball = 8, everything else lets the counselor pick halves/quarters.
  const [period, setPeriod]           = useState(1);
  const [periodFmt, setPeriodFmt]     = useState("halves");
  const [seriesFormat, setSeriesFormat] = useState(3);
  const [seriesA, setSeriesA] = useState(0);
  const [seriesB, setSeriesB] = useState(0);

  // Softball — each team keeps its own spot in the batting order, so
  // switching halves resumes where that team left off.
  const [lineupOpen, setLineupOpen] = useState(false);
  const [lineupDone, setLineupDone] = useState(false);
  const [homeTeam, setHomeTeam]     = useState("B");
  const [battingTeam, setBattingTeam] = useState("A");
  const [atBatResults, setAtBatResults] = useState([]);
  const [batterIdxA, setBatterIdxA] = useState(0);
  const [batterIdxB, setBatterIdxB] = useState(0);
  const [outsThisHalf, setOutsThisHalf] = useState(0);
  // Single-level undo: snapshot of everything BEFORE the last at-bat /
  // +1 Out, plus which stat (if any) to reverse. Survives half-flips.
  const [lastAtBatSnap, setLastAtBatSnap] = useState(null);

  // Persist softball state into live_games.notes so closing the app (or
  // switching phones) resumes the game exactly where it was.
  function saveSoftballState(next = {}) {
    const g = gameRef.current;
    if (!g || !isSoftball(g.sport)) return;
    const payload = {
      softball: {
        inning, inningHalf, outsThisHalf, homeTeam, battingTeam,
        batterIdxA, batterIdxB, lineupDone, atBatResults,
        ...next,
      },
    };
    supabase.from("live_games")
      .update({ notes: JSON.stringify(payload), updated_at: new Date().toISOString() })
      .eq("id", g.id)
      .then(() => {}, () => {}); // network blip — state re-saves on next action
  }

  // Guard only for single-shot actions (advance batter, end set) —
  // NOT for repeatable +1 taps, which counselors fire rapidly on purpose.
  const singleShotRef = useRef(false);
  function singleShot(fn) {
    return async (...args) => {
      if (singleShotRef.current) return;
      singleShotRef.current = true;
      setTimeout(() => { singleShotRef.current = false; }, 300);
      await fn(...args);
    };
  }

  // Trailing-debounced background syncs: rapid taps trigger ONE refresh
  // 800ms after the burst ends, instead of a refresh per tap (which caused
  // score flicker and could briefly overwrite optimistic state).
  const gameSyncTimer  = useRef(null);
  const statsSyncTimer = useRef(null);
  function scheduleGameSync()  { clearTimeout(gameSyncTimer.current);  gameSyncTimer.current  = setTimeout(() => loadGame({ quiet: true }), 800); }
  function scheduleStatsSync() { clearTimeout(statsSyncTimer.current); statsSyncTimer.current = setTimeout(() => { if (gameRef.current) loadEventTotals(gameRef.current); }, 800); }
  useEffect(() => () => { clearTimeout(gameSyncTimer.current); clearTimeout(statsSyncTimer.current); }, []);

  // Keep a ref of game for timers/closures
  const gameRef = useRef(null);
  useEffect(() => { gameRef.current = game; }, [game]);

  // Network-resilient RPC: camp WiFi drops requests, and supabase-js THROWS
  // on network failure (iOS shows "TypeError: Load failed") instead of
  // returning { error }. This retries up to 3 times with backoff and always
  // resolves to { error } so callers never leave unhandled rejections.
  async function rpcWithRetry(fn, tries = 3) {
    for (let i = 0; i < tries; i++) {
      try {
        const { error } = await fn();
        if (!error) return { error: null };
        if (i === tries - 1) return { error };
      } catch {
        if (i === tries - 1) return { error: { message: "⚠️ WiFi dropped — that tap did NOT save. Check the score." } };
      }
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
    return { error: null };
  }

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Keep the phone screen awake during a live game. Re-acquires the lock
  // when the counselor switches apps and comes back (locks auto-release
  // on tab switch, so without the visibility handler it would only work
  // until the first interruption).
  useEffect(() => {
    let lock = null;
    let released = false;
    async function acquire() {
      try {
        if ("wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {}
    }
    function onVisible() {
      if (document.visibilityState === "visible" && !released) acquire();
    }
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      try { lock?.release(); } catch {}
    };
  }, []);

  const rules = getSportRules(game?.sport);

  useEffect(() => {
    if (!rules?.clock?.enabled) return;
    setClockMode(rules?.clock?.defaultMode || rules?.clock?.modes?.[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.sport]);

  const activeClockMode = rules?.clock?.enabled
    ? ((rules?.clock?.modes ?? []).find((m) => m.id === clockMode) ?? rules?.clock?.modes?.[0] ?? null)
    : null;

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
      if (isSoftball(data?.sport) && !quiet) {
        // Restore persisted softball state (initial load only — quiet
        // background syncs must not clobber in-progress local state)
        let restored = false;
        try {
          const parsed = JSON.parse(data.notes || "{}");
          const sb = parsed.softball;
          if (sb && sb.lineupDone) {
            setInning(Number(sb.inning) || 1);
            setInningHalf(sb.inningHalf === "bottom" ? "bottom" : "top");
            setOutsThisHalf(Number(sb.outsThisHalf) || 0);
            setHomeTeam(sb.homeTeam === "A" ? "A" : "B");
            setBattingTeam(sb.battingTeam === "B" ? "B" : "A");
            setBatterIdxA(Number(sb.batterIdxA) || 0);
            setBatterIdxB(Number(sb.batterIdxB) || 0);
            setAtBatResults(Array.isArray(sb.atBatResults) ? sb.atBatResults : []);
            setLineupDone(true);
            restored = true;
          }
        } catch {}
        if (!restored && !lineupDone) setLineupOpen(true);
      }
    } catch (e) {
      if (!quiet) setErr(e?.message ?? String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function loadEventTotals(g) {
    try {
      const { data, error } = await supabase.from("live_events").select("player_id, stat_key, delta")
        .eq("game_id", g.id).eq("event_type", "stat").limit(10000);
      if (error) throw error;
      const totals = {};
      for (const row of data || []) {
        const k = `${row.player_id}:${row.stat_key}`;
        totals[k] = (totals[k] || 0) + Number(row.delta || 0);
      }
      setStatTotals(totals);
    } catch {
      // network blip during background sync — keep optimistic totals
    }
  }

  function uniqNonEmpty(arr) { return Array.from(new Set((arr || []).map(norm).filter(Boolean))); }

  async function ensureRoster(g) {
    try {
    const { data: r1, error: r1Err } = await supabase.from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", g.id).order("team_side").order("sort_order").limit(5000);

    // A failed check here must NOT fall through to the "no roster yet"
    // build-from-scratch path below -- that path INSERTS a synthesized
    // roster, and if a real roster already exists but this query just
    // failed to fetch it, that insert would duplicate every row.
    if (r1Err) {
      setErr("⚠️ Couldn't load the roster — check WiFi and refresh.");
      return;
    }

    if (r1 && r1.length) {
      setRosterA(r1.filter((x) => x.team_side === "A"));
      setRosterB(r1.filter((x) => x.team_side === "B"));
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

    const isCwGame = String(g.season || "league") === "cw";

    let players, playersErr;
    if (isCwGame) {
      // Color War: teams are blue/white camp-wide. Match players by cw_team,
      // filtered to this game's age league so a Senior game only pulls seniors.
      const { data, error } = await supabase
        .from("players")
        .select("id, first_name, last_name, cw_team, league_id, team_name")
        .eq("league_id", lk)
        .in("cw_team", ["blue", "white"])
        .eq("departed", false)
        .limit(5000);
      players = data; playersErr = error;
    } else {
      const pq = mt === "crest_cup"
        ? supabase.from("players").select("id, first_name, last_name, team_name, league_id").in("team_name", allTeams).eq("departed", false).limit(5000)
        : supabase.from("players").select("id, first_name, last_name, team_name, league_id").eq("league_id", lk).in("team_name", allTeams).eq("departed", false).limit(5000);
      const { data, error } = await pq;
      players = data; playersErr = error;
    }

    if (playersErr) {
      setErr("⚠️ Couldn't build the roster — check WiFi and refresh.");
      return;
    }

    const oA = { v: 0 }, oB = { v: 0 };
    const rows = (players || []).map((p) => {
      const tn = isCwGame ? norm(p.cw_team) : norm(p.team_name);
      const side = teamsA.includes(tn) ? "A" : "B";
      const so = side === "A" ? oA.v++ : oB.v++;
      return { game_id: g.id, player_id: String(p.id), player_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), team_side: side, team_name: tn, is_playing: false, sort_order: so };
    });

    if (rows.length) {
      const chunk = 250;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error: insErr } = await supabase.from("game_roster").insert(rows.slice(i, i + chunk));
        if (insErr) {
          setErr("⚠️ Roster only partly saved — check WiFi and refresh before scoring.");
          break;
        }
      }
    }

    const { data: r2, error: r2Err } = await supabase.from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", g.id).order("team_side").order("sort_order").limit(5000);

    if (r2Err) {
      setErr("⚠️ Couldn't reload the roster after building it — refresh to see it.");
      return;
    }

    setRosterA((r2 || []).filter((x) => x.team_side === "A"));
    setRosterB((r2 || []).filter((x) => x.team_side === "B"));
    } catch {
      setErr("⚠️ Couldn't load rosters — check WiFi and refresh.");
    }
  }

  useEffect(() => { if (gameId) loadGame(); /* eslint-disable-next-line */ }, [gameId]);

  useEffect(() => {
    if (!game?.id) return;
    // None of these three depends on another's result -- all they need is
    // already on `game` -- so they run together instead of one-after-
    // another. This gated how soon a counselor could start scoring.
    (async () => {
      const teamNames = uniqNonEmpty([game.team_a1 || game.team_a, game.team_b1 || game.team_b]);
      const [, , caps] = await Promise.all([
        ensureRoster(game),
        loadEventTotals(game),
        fetchCaptainIds({ leagueId: norm(game.league_key), teamNames }).catch(() => new Set()),
      ]);
      setCaptainIds(caps);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  async function updateLiveGame(patch) {
    try {
      const { data, error } = await supabase.from("live_games")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", game.id).select("*").single();
      if (error) { setErr(error.message); return null; }
      setGame(data);
      return data;
    } catch {
      setErr("⚠️ WiFi dropped — that didn't save. Try again.");
      return null;
    }
  }

  // ── Timer handlers (compute remaining at call time) ───────────────────────
  async function onStart() {
    if (!game) return;
    const rem = computeRemaining(game);
    await updateLiveGame({ timer_running: true, timer_anchor_ts: Date.now() / 1000, timer_remaining_at_anchor: Math.floor(rem), timer_remaining_seconds: Math.floor(rem) });
  }
  async function onPause() {
    if (!game) return;
    const rem = computeRemaining(game);
    await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: Math.floor(rem), timer_remaining_seconds: Math.floor(rem) });
  }
  async function onReset(seconds) {
    if (!game) return;
    const s = Math.max(0, Math.floor(Number(seconds)));
    await updateLiveGame({ timer_running: false, timer_anchor_ts: null, duration_seconds: s, timer_remaining_at_anchor: s, timer_remaining_seconds: s });
  }
  async function setExactRemaining(seconds) {
    if (!game) return;
    const s = Math.max(0, Math.floor(Number(seconds)));
    await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: s, timer_remaining_seconds: s });
  }
  async function openSetTimeModal() {
    if (!rules?.clock?.enabled) return;
    if (game?.timer_running) await onPause();
    setTimeInput(fmtClock(computeRemaining(gameRef.current)));
    setSetTimeOpen(true);
  }

  // ── Scoring — NO debounce. Optimistic instantly, one trailing sync. ──────
  function bumpScore(side, delta) {
    if (!game) return;
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Number(prev.score_a || 0) + d : Number(prev.score_a || 0),
      score_b: side === "B" ? Number(prev.score_b || 0) + d : Number(prev.score_b || 0),
    });
    rpcWithRetry(() => supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d }))
      .then(({ error }) => { if (error) setErr(error.message); scheduleGameSync(); });
  }

  function undoScore(side) {
    if (!game) return;
    const current = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
    if (current <= 0) return;
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Math.max(0, Number(prev.score_a || 0) - 1) : Number(prev.score_a || 0),
      score_b: side === "B" ? Math.max(0, Number(prev.score_b || 0) - 1) : Number(prev.score_b || 0),
    });
    rpcWithRetry(() => supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 }))
      .then(({ error }) => { if (error) setErr(error.message); scheduleGameSync(); });
  }

  function addStatEvent(player, statKey, delta) {
    rpcWithRetry(() => supabase.rpc("rpc_add_stat", {
      p_game_id: game.id, p_league_id: norm(game.league_key), p_sport: norm(game.sport),
      p_player_id: String(player.player_id), p_player_name: String(player.player_name || player.player_id),
      p_team_name: String(player?.team_name || ""), p_stat_key: norm(statKey), p_delta: delta,
    })).then(({ error }) => { if (error) setErr(error.message); scheduleStatsSync(); });
  }

  function bumpStat(player, statKey, delta) {
    if (!game) return;
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    const key = `${player.player_id}:${norm(statKey)}`;
    setStatTotals((prev) => ({ ...prev, [key]: (prev[key] || 0) + d }));
    addStatEvent(player, statKey, d);
  }

  function undoStat(player, statKey) {
    if (!game) return;
    const key = `${player.player_id}:${norm(statKey)}`;
    if (Number(statTotals[key] || 0) <= 0) return;
    setStatTotals((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) }));
    addStatEvent(player, statKey, -1);
  }

  // NOTE: bumpHoopPoints/bumpGoalWithScore (and their undo counterparts,
  // below) each fire two independent RPCs -- addStatEvent's rpc_add_stat
  // and this function's own rpc_add_score -- with separate 3-try retries
  // and no shared transaction. If one permanently fails after retries and
  // the other succeeds, the team score and the player's individual stat
  // total go out of sync (an error IS surfaced via setErr when a retry
  // exhausts, so it's not silent, but it doesn't say which side failed or
  // attempt to reconcile the other). A real fix needs a single combined
  // server-side RPC doing both writes in one transaction -- that requires
  // Supabase dashboard/SQL access this session doesn't have. Left as-is
  // deliberately rather than risk a client-side compensating-write change
  // to live scoring without being able to test it in a real browser.
  function bumpHoopPoints(player, side, delta) {
    if (!game) return;
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    const ptsKey = `${player.player_id}:pts`;
    setStatTotals((prev) => ({ ...prev, [ptsKey]: (prev[ptsKey] || 0) + d }));
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Number(prev.score_a || 0) + d : Number(prev.score_a || 0),
      score_b: side === "B" ? Number(prev.score_b || 0) + d : Number(prev.score_b || 0),
    });
    addStatEvent(player, "pts", d);
    rpcWithRetry(() => supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d }))
      .then(({ error }) => { if (error) setErr(error.message); scheduleGameSync(); });
  }

  function undoHoopPoints(player, side) {
    if (!game) return;
    const ptsKey = `${player.player_id}:pts`;
    if (Number(statTotals[ptsKey] || 0) <= 0) return;
    setStatTotals((prev) => ({ ...prev, [ptsKey]: Math.max(0, (prev[ptsKey] || 0) - 1) }));
    const sideScore = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Math.max(0, Number(prev.score_a || 0) - 1) : Number(prev.score_a || 0),
      score_b: side === "B" ? Math.max(0, Number(prev.score_b || 0) - 1) : Number(prev.score_b || 0),
    });
    addStatEvent(player, "pts", -1);
    if (sideScore > 0) {
      rpcWithRetry(() => supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 }))
        .then(({ error }) => { if (error) setErr(error.message); scheduleGameSync(); });
    }
  }

  function bumpGoalWithScore(player, side, delta) {
    if (!game) return;
    const d = Math.floor(Number(delta));
    if (!Number.isFinite(d) || d === 0) return;
    const gKey = `${player.player_id}:g`;
    setStatTotals((prev) => ({ ...prev, [gKey]: (prev[gKey] || 0) + d }));
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Number(prev.score_a || 0) + d : Number(prev.score_a || 0),
      score_b: side === "B" ? Number(prev.score_b || 0) + d : Number(prev.score_b || 0),
    });
    addStatEvent(player, "g", d);
    rpcWithRetry(() => supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: d }))
      .then(({ error }) => { if (error) setErr(error.message); scheduleGameSync(); });
  }

  function undoGoalWithScore(player, side) {
    if (!game) return;
    const gKey = `${player.player_id}:g`;
    if (Number(statTotals[gKey] || 0) <= 0) return;
    setStatTotals((prev) => ({ ...prev, [gKey]: Math.max(0, (prev[gKey] || 0) - 1) }));
    const sideScore = side === "A" ? Number(game.score_a || 0) : Number(game.score_b || 0);
    setGame((prev) => !prev ? prev : {
      ...prev,
      score_a: side === "A" ? Math.max(0, Number(prev.score_a || 0) - 1) : Number(prev.score_a || 0),
      score_b: side === "B" ? Math.max(0, Number(prev.score_b || 0) - 1) : Number(prev.score_b || 0),
    });
    addStatEvent(player, "g", -1);
    if (sideScore > 0) {
      rpcWithRetry(() => supabase.rpc("rpc_add_score", { p_game_id: game.id, p_side: side, p_delta: -1 }))
        .then(({ error }) => { if (error) setErr(error.message); scheduleGameSync(); });
    }
  }

  // In/Out — optimistic; short guard so a double-tap doesn't toggle in+out
  const togglePlaying = singleShot(async (player) => {
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
    const apply = (arr) => arr.map((p) => p.player_id === player.player_id ? { ...p, is_playing: next, sort_order: newSortOrder } : p);
    if (side === "A") setRosterA(apply); else setRosterB(apply);

    const patch = next && isBatting ? { is_playing: next, sort_order: newSortOrder } : { is_playing: next };
    try {
      const { error } = await supabase.from("game_roster").update(patch).eq("game_id", player.game_id).eq("player_id", player.player_id);
      if (error) throw error;
    } catch (e) {
      setErr(e?.message || "⚠️ WiFi dropped — In/Out didn't save. Tap again.");
      const revert = (arr) => arr.map((p) => p.player_id === player.player_id ? { ...p, is_playing: !next } : p);
      if (side === "A") setRosterA(revert); else setRosterB(revert);
    }
  });

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

    const { error: aErr } = await supabase.from("game_roster").update({ sort_order: b.sort_order }).eq("game_id", a.game_id).eq("player_id", a.player_id);
    if (aErr) {
      // Nothing persisted yet -- just revert the optimistic UI change.
      if (side === "A") setRosterA(list); else setRosterB(list);
      setErr("⚠️ Couldn't reorder batting lineup — check WiFi and try again.");
      return;
    }

    const { error: bErr } = await supabase.from("game_roster").update({ sort_order: a.sort_order }).eq("game_id", b.game_id).eq("player_id", b.player_id);
    if (bErr) {
      // a's row is now at b's old sort_order in the DB, but b's row never
      // moved off it -- both would share a sort_order (this is NOT
      // self-healing on next load, despite what the old comment here
      // claimed). Roll a back so the DB stays internally consistent even
      // though the swap didn't go through.
      const { error: rollbackErr } = await supabase.from("game_roster").update({ sort_order: a.sort_order }).eq("game_id", a.game_id).eq("player_id", a.player_id);
      if (side === "A") setRosterA(list); else setRosterB(list);
      setErr(rollbackErr
        ? "⚠️ Batting order may be out of sync — refresh before continuing."
        : "⚠️ Couldn't reorder batting lineup — check WiFi and try again.");
    }
  }

  // ── Softball at-bat (single-shot guarded — advancing twice is harmful) ───
  const recordAtBat = singleShot(async (outcome) => {
    if (!game) return;
    const battingRoster = (battingTeam === "A" ? rosterA : rosterB)
      .filter((p) => p.is_playing)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    if (!battingRoster.length) return;

    const idx = battingTeam === "A" ? batterIdxA : batterIdxB;
    const batter = battingRoster[idx % battingRoster.length];

    // Snapshot state BEFORE this at-bat for single-level undo
    setLastAtBatSnap({
      inning, inningHalf, outsThisHalf, battingTeam, batterIdxA, batterIdxB,
      atBatResults,
      statReversal: outcome.statKey && batter ? { player: batter, statKey: outcome.statKey } : null,
    });

    if (outcome.statKey && batter) {
      const key = `${batter.player_id}:${outcome.statKey}`;
      setStatTotals((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
      addStatEvent(batter, outcome.statKey, 1);
    }

    const newResults = [...atBatResults, {
      playerId: batter.player_id, playerName: batter.player_name,
      outcome: outcome.key, label: outcome.label, inning, half: inningHalf,
    }];
    setAtBatResults(newResults);

    // Batter completed their at-bat — advance THIS team's spot in the order
    const nextIdx = (idx + 1) % battingRoster.length;
    if (battingTeam === "A") setBatterIdxA(nextIdx);
    else setBatterIdxB(nextIdx);

    const outsToAdd = outcome.isOut ? (outcome.outs || 1) : 0;
    const newOuts = outsThisHalf + outsToAdd;

    if (newOuts >= 3) {
      // Half over — flip sides. Batting positions are preserved per team.
      const nextHalfIsBottom = inningHalf === "top";
      const nextInning = nextHalfIsBottom ? inning : inning + 1;
      const nextBatting = nextHalfIsBottom ? homeTeam : (homeTeam === "A" ? "B" : "A");
      setInningHalf(nextHalfIsBottom ? "bottom" : "top");
      setInning(nextInning);
      setBattingTeam(nextBatting);
      setOutsThisHalf(0);
      saveSoftballState({
        inning: nextInning, inningHalf: nextHalfIsBottom ? "bottom" : "top",
        outsThisHalf: 0, battingTeam: nextBatting, atBatResults: newResults,
        batterIdxA: battingTeam === "A" ? nextIdx : batterIdxA,
        batterIdxB: battingTeam === "B" ? nextIdx : batterIdxB,
      });
      return;
    }

    setOutsThisHalf(newOuts);
    saveSoftballState({
      outsThisHalf: newOuts, atBatResults: newResults,
      batterIdxA: battingTeam === "A" ? nextIdx : batterIdxA,
      batterIdxB: battingTeam === "B" ? nextIdx : batterIdxB,
    });
  });

  // Standalone +1 Out — baserunning outs (caught stealing, tagged, etc.).
  // Adds an out WITHOUT advancing the batting order or logging an at-bat.
  const addOutOnly = singleShot(async () => {
    setLastAtBatSnap({
      inning, inningHalf, outsThisHalf, battingTeam, batterIdxA, batterIdxB,
      atBatResults, statReversal: null,
    });
    const newOuts = outsThisHalf + 1;
    if (newOuts >= 3) {
      const nextHalfIsBottom = inningHalf === "top";
      const nextInning = nextHalfIsBottom ? inning : inning + 1;
      const nextBatting = nextHalfIsBottom ? homeTeam : (homeTeam === "A" ? "B" : "A");
      setInningHalf(nextHalfIsBottom ? "bottom" : "top");
      setInning(nextInning);
      setBattingTeam(nextBatting);
      setOutsThisHalf(0);
      saveSoftballState({
        inning: nextInning, inningHalf: nextHalfIsBottom ? "bottom" : "top",
        outsThisHalf: 0, battingTeam: nextBatting,
      });
      return;
    }
    setOutsThisHalf(newOuts);
    saveSoftballState({ outsThisHalf: newOuts });
  });

  const endSet = singleShot(async () => {
    if (!game) return;
    const sa = Number(game.score_a || 0), sb = Number(game.score_b || 0);
    if (sa === sb) { setErr("Set is tied. A set must have a winner before ending it."); return; }
    const newSA = sa > sb ? seriesA + 1 : seriesA;
    const newSB = sb > sa ? seriesB + 1 : seriesB;
    const notes = stringifySeriesNotes(seriesFormat, newSA, newSB);
    try {
      const { data, error } = await supabase.from("live_games")
        .update({ score_a: 0, score_b: 0, notes, updated_at: new Date().toISOString() })
        .eq("id", game.id).select("*").single();
      if (error) { setErr(error.message); return; }
      setGame(data); setSeriesA(newSA); setSeriesB(newSB);
    } catch {
      setErr("⚠️ WiFi dropped — set didn't end. Tap End Set again.");
    }
  });

  // Restores the exact pre-tap state (outs, order, half, inning, batting
  // team) and reverses the logged stat if there was one. One level deep.
  const undoLastAtBat = singleShot(async () => {
    if (!lastAtBatSnap) return;
    const s = lastAtBatSnap;
    setInning(s.inning);
    setInningHalf(s.inningHalf);
    setOutsThisHalf(s.outsThisHalf);
    setBattingTeam(s.battingTeam);
    setBatterIdxA(s.batterIdxA);
    setBatterIdxB(s.batterIdxB);
    setAtBatResults(s.atBatResults);
    if (s.statReversal) {
      const { player, statKey } = s.statReversal;
      const key = `${player.player_id}:${statKey}`;
      setStatTotals((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) }));
      addStatEvent(player, statKey, -1);
    }
    setLastAtBatSnap(null);
    saveSoftballState({
      inning: s.inning, inningHalf: s.inningHalf, outsThisHalf: s.outsThisHalf,
      battingTeam: s.battingTeam, batterIdxA: s.batterIdxA, batterIdxB: s.batterIdxB,
      atBatResults: s.atBatResults,
    });
  });

  const nextHalfSoftball = singleShot(async () => {
    // Preserves each team's spot in the batting order — no reset.
    const nextHalfIsBottom = inningHalf === "top";
    const nextInning = nextHalfIsBottom ? inning : inning + 1;
    const nextBatting = nextHalfIsBottom ? homeTeam : (homeTeam === "A" ? "B" : "A");
    setInningHalf(nextHalfIsBottom ? "bottom" : "top");
    setInning(nextInning);
    setBattingTeam(nextBatting);
    setOutsThisHalf(0);
    saveSoftballState({
      inning: nextInning, inningHalf: nextHalfIsBottom ? "bottom" : "top",
      outsThisHalf: 0, battingTeam: nextBatting,
    });
  });

  const nextHalfKickball = singleShot(async () => {
    if (inningHalf === "top") setInningHalf("bottom");
    else { setInningHalf("top"); setInning((v) => v + 1); }
  });

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
        notifyGameFinalized(game, { score_a: seriesA, score_b: seriesB });
        router.push("/");
      } catch {
        setErr("⚠️ WiFi dropped — game did NOT finalize. Tap Finalize again.");
      } finally { setFinalizing(false); }
      return;
    }
    if (rules?.clock?.enabled && game.timer_running) { setErr("Pause the clock before finalizing."); return; }
    const sa = Number(game.score_a || 0), sb = Number(game.score_b || 0);
    if (sa === 0 && sb === 0) { setErr("Score is 0-0. Add points before finalizing."); return; }
    if (sa === sb) { setErr("Score is tied. Bauercrest has no ties — adjust before finalizing."); return; }

    // Card-data guard: individual-stat sports should have player stats logged
    // before finalizing. Volleyball/Newcomb are team-outcome only, so skip them.
    const statSports = ["hoop","soccer","euro","hockey","speedball","softball","football","kickball"];
    if (statSports.includes(norm(game.sport))) {
      const anyStats = Object.values(statTotals || {}).some((v) => Number(v) > 0);
      if (!anyStats) {
        const proceed = confirm("This game has NO player stats logged.\n\nFor player cards we want every goal/point/hit recorded. Log stats first, or finalize anyway?");
        if (!proceed) { setFinalizing(false); return; }
      }
    }
    setFinalizing(true);
    try {
      if (rules?.clock?.enabled) {
        const rem = Math.floor(computeRemaining(game));
        const g2 = await updateLiveGame({ timer_running: false, timer_anchor_ts: null, timer_remaining_at_anchor: rem, timer_remaining_seconds: rem });
        if (!g2) return;
      }
      const { error } = await supabase.rpc("finalize_game", { gid: game.id });
      if (error) { setErr(error.message); return; }
      notifyGameFinalized(game);
      router.push("/");
    } catch {
      setErr("⚠️ WiFi dropped — game did NOT finalize. Tap Finalize again.");
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

  const getVal = (pid, statKey) => Number(statTotals[`${pid}:${norm(statKey)}`] || 0);
  const isCapFn = (pid) => captainIds instanceof Set && captainIds.has(String(pid));

  const playingA = rosterA.filter((p) => p.is_playing).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const benchA   = rosterA.filter((p) => !p.is_playing);
  const playingB = rosterB.filter((p) => p.is_playing).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const benchB   = rosterB.filter((p) => !p.is_playing);

  const scoreButtons = rules?.scoreButtons?.length ? rules.scoreButtons : [1];
  const statDefs = rules?.stats ?? [];
  const isHoop = norm(game.sport) === "hoop";
  const isSoftballGame = isSoftball(game.sport);
  const noStat = !rules?.clock?.enabled && (rules?.stats?.length ?? 0) === 0;
  const clockPresets = activeClockMode?.presets ?? [300, 600, 900, 1200, 1800];

  const battingRoster = battingTeam === "A" ? playingA : playingB;
  const activeBatterIdx = battingTeam === "A" ? batterIdxA : batterIdxB;
  const currentBatter = battingRoster.length ? battingRoster[activeBatterIdx % battingRoster.length] : null;

  // Period counter config — only for clocked, non-batting sports
  const sportNorm = norm(game.sport);
  const showPeriods = !!rules?.clock?.enabled && !isBattingSport(game.sport);
  const periodIsFixed = sportNorm === "hockey" || sportNorm === "speedball";
  const periodMax = sportNorm === "hockey" ? 3 : sportNorm === "speedball" ? 8 : (periodFmt === "halves" ? 2 : 4);
  const periodLabel = periodIsFixed ? "Period" : (periodFmt === "halves" ? "Half" : "Quarter");
  const periodPrefix = periodIsFixed ? "P" : (periodFmt === "halves" ? "H" : "Q");

  const onBumpChip = (p, sd, side, d) => sd.key === "g" && GOAL_AUTO_SCORE_SPORTS.includes(norm(game?.sport)) ? bumpGoalWithScore(p, side, d) : bumpStat(p, sd.key, d);
  const onUndoChip = (p, sd, side)   => sd.key === "g" && GOAL_AUTO_SCORE_SPORTS.includes(norm(game?.sport)) ? undoGoalWithScore(p, side) : undoStat(p, sd.key);

  return (
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-[#0a1628] text-white" style={{ touchAction: "manipulation" }}>

      {/* Always visible, regardless of scroll position — a failed tap's
          error must never render off-screen above where the counselor
          is scrolled to while entering stats. */}
      <div className="sticky top-0 z-40 flex flex-col shadow-lg shadow-black/40">
        {!isOnline && (
          <div className="bg-red-600 px-4 py-2.5 text-center text-sm font-black text-white">
            ⚠️ NO WIFI — Scores are NOT saving. Reconnect before continuing.
          </div>
        )}

        {err && (
          <div className="bg-[#0a1628] px-3 pt-2">
            <div className="rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-xs font-bold text-red-200">{err}</div>
          </div>
        )}

        {/* Top bar */}
        {showTopBar ? (
          <div className="flex items-center justify-between border-b border-white/10 bg-[#06101f] px-3 py-2 landscape:py-1">
            <div className="min-w-0 truncate text-[11px] font-bold uppercase tracking-widest text-white/40">
              {game.league_key} · {game.sport} · {game.level} · {game.mode}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => router.push("/")}
                className={`${BTN} rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-white/60`}>Home</button>
              <button onClick={() => setShowTopBar(false)}
                className={`${BTN} rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-bold text-white/60`}>▲</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowTopBar(true)}
            className={`${BTN} flex w-full items-center justify-center border-b border-white/10 bg-[#06101f] py-1 text-white/30`}>
            <span className="text-[10px]">☰</span>
          </button>
        )}

        {/* ── SCOREBOARD ── */}
        <div className="border-b border-white/10 bg-[#07112a] px-3 py-2 landscape:py-1.5">
        {isHoop ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">{leftLabel}</div>
              <div className="text-2xl font-black tabular-nums text-white landscape:text-xl">{scoreA}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              {rules?.clock?.enabled ? (
                <>
                  <ClockButton game={game} onOpen={openSetTimeModal} />
                  <div className="flex items-center gap-1.5">
                    {game.timer_running
                      ? <button onClick={onPause} className={`${BTN} rounded-lg bg-white px-4 py-2 text-xs font-black text-black active:scale-95`}>Pause</button>
                      : <button onClick={onStart} className={`${BTN} rounded-lg bg-white px-4 py-2 text-xs font-black text-black active:scale-95`}>Start</button>}
                    <button onClick={() => onReset(game.duration_seconds || clockPresets[clockPresets.length - 1] || 1800)}
                      className={`${BTN} rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black active:scale-95`}>Reset</button>
                    <button onClick={() => setConfirmFinalizeOpen(true)}
                      className={`${BTN} rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-black text-emerald-200 active:scale-95`}>Finalize</button>
                  </div>
                  {showPeriods && (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setPeriod((v) => Math.max(1, v - 1))} disabled={period <= 1}
                        className={`${BTN} rounded border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-black active:scale-95 disabled:opacity-20`}>-1</button>
                      <span className="text-sm font-black tabular-nums text-white">{periodPrefix}{period}<span className="text-[10px] text-white/30">/{periodMax}</span></span>
                      <button onClick={() => setPeriod((v) => Math.min(periodMax, v + 1))} disabled={period >= periodMax}
                        className={`${BTN} rounded border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-black active:scale-95 disabled:opacity-20`}>+1</button>
                      {!periodIsFixed && (
                        <select value={periodFmt}
                          onChange={(e) => { setPeriodFmt(e.target.value); setPeriod(1); }}
                          className="rounded border border-white/10 bg-[#0a1628] px-1.5 py-0.5 text-[9px] font-bold text-white outline-none">
                          <option value="halves">H</option>
                          <option value="quarters">Q</option>
                        </select>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <button onClick={() => setConfirmFinalizeOpen(true)}
                  className={`${BTN} rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-200 active:scale-95`}>Finalize</button>
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
              className={`${BTN} flex min-h-[150px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-2 py-3 active:scale-[0.98] active:bg-white/10`}>
              <div className="truncate text-sm font-black uppercase tracking-widest text-blue-400/70">{leftLabel}</div>
              <div className="mt-1 text-8xl font-black leading-none tabular-nums text-white">{scoreA}</div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/30">Tap · +1</div>
            </button>
            <div className="flex flex-col items-center justify-center gap-2 px-1">
              {isSeriesSport(game.sport) && (
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Series (Bo{seriesFormat})</div>
                  <div className="text-5xl font-black tabular-nums text-white">{seriesA} - {seriesB}</div>
                  <button onClick={endSet} disabled={scoreA === scoreB}
                    className={`${BTN} mt-1 rounded-xl border border-amber-400/40 bg-amber-500/15 px-6 py-3 text-base font-black text-amber-200 active:scale-95 disabled:opacity-30`}>End Set</button>
                </div>
              )}
              {norm(game.sport) === "kickball" && (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">{inningHalf === "top" ? "▲ TOP" : "▼ BOT"}</div>
                  <div className="text-4xl font-black tabular-nums text-white">{inning}</div>
                  <button onClick={nextHalfKickball}
                    className={`${BTN} mt-1 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-black active:scale-95`}>Next Half</button>
                </div>
              )}
              <button onClick={() => setConfirmFinalizeOpen(true)}
                className={`${BTN} rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-6 py-3 text-base font-black text-emerald-200 active:scale-95`}>Finalize</button>
              <div className="flex items-center gap-2">
                <button onClick={() => undoScore("A")} disabled={scoreA <= 0}
                  className={`${BTN} rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black text-red-300 active:scale-95 disabled:opacity-20`}>{leftLabel} -1</button>
                <button onClick={() => undoScore("B")} disabled={scoreB <= 0}
                  className={`${BTN} rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black text-red-300 active:scale-95 disabled:opacity-20`}>{rightLabel} -1</button>
              </div>
            </div>
            <button onClick={() => bumpScore("B", 1)}
              className={`${BTN} flex min-h-[150px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-2 py-3 active:scale-[0.98] active:bg-white/10`}>
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
                  className={`${BTN} flex-1 rounded-lg border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20`}>-1</button>
                {scoreButtons.map((d) => (
                  <button key={`A-${d}`} onClick={() => bumpScore("A", d)}
                    className={`${BTN} flex-1 rounded-lg border border-white/15 bg-white/10 py-2.5 text-sm font-black active:scale-95`}>+{d}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 px-2">
              {rules?.clock?.enabled ? (
                <>
                  <ClockButton game={game} onOpen={openSetTimeModal} big />
                  <div className="flex items-center gap-1.5">
                    {game.timer_running
                      ? <button onClick={onPause} className={`${BTN} rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black active:scale-95`}>Pause</button>
                      : <button onClick={onStart} className={`${BTN} rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black active:scale-95`}>Start</button>}
                    <button onClick={() => onReset(game.duration_seconds || clockPresets[clockPresets.length - 1] || 1800)}
                      className={`${BTN} rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black active:scale-95`}>Reset</button>
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-0.5 max-w-[120px]">
                    {clockPresets.map((s) => (
                      <button key={`preset-${s}`} onClick={() => onReset(s)}
                        className={`${BTN} shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] font-bold active:scale-95`}>
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
                    className={`${BTN} rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-200 active:scale-95 disabled:opacity-30`}>End Set</button>
                </div>
              )}
              {showPeriods && (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40">{periodLabel}</div>
                  <div className="text-2xl font-black tabular-nums text-white">{periodPrefix}{period}<span className="text-sm text-white/30">/{periodMax}</span></div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPeriod((v) => Math.max(1, v - 1))} disabled={period <= 1}
                      className={`${BTN} rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-black active:scale-95 disabled:opacity-20`}>-1</button>
                    <button onClick={() => setPeriod((v) => Math.min(periodMax, v + 1))} disabled={period >= periodMax}
                      className={`${BTN} rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-black active:scale-95 disabled:opacity-20`}>+1</button>
                  </div>
                  {!periodIsFixed && (
                    <select value={periodFmt}
                      onChange={(e) => { setPeriodFmt(e.target.value); setPeriod(1); }}
                      className="rounded-lg border border-white/10 bg-[#0a1628] px-2 py-1 text-[10px] font-bold text-white outline-none">
                      <option value="halves">Halves</option>
                      <option value="quarters">Quarters</option>
                    </select>
                  )}
                </div>
              )}
              {isSoftballGame && (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/40">{inningHalf === "top" ? "▲ TOP" : "▼ BOT"}</div>
                  <div className="text-2xl font-black tabular-nums text-white">{inning}</div>
                  <button onClick={nextHalfSoftball}
                    className={`${BTN} rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black active:scale-95`}>Next Half</button>
                </div>
              )}
              <button onClick={() => setConfirmFinalizeOpen(true)}
                className={`${BTN} mt-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-200 active:scale-95`}>Finalize</button>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/60">Away</div>
              <div className="mt-0.5 truncate text-base font-black text-white">{rightLabel}</div>
              <div className="mt-1 text-5xl font-black tabular-nums text-white">{scoreB}</div>
              <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                {scoreButtons.map((d) => (
                  <button key={`B-${d}`} onClick={() => bumpScore("B", d)}
                    className={`${BTN} flex-1 rounded-lg border border-white/15 bg-white/10 py-2.5 text-sm font-black active:scale-95`}>+{d}</button>
                ))}
                <button onClick={() => undoScore("B")} disabled={scoreB <= 0}
                  className={`${BTN} flex-1 rounded-lg border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-black text-red-300 active:scale-95 disabled:opacity-20`}>-1</button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ── BODY ── */}
      {isSoftballGame && lineupDone ? (
        <div className="p-3 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-400/70">
                  Now Batting · {battingTeam === "A" ? leftLabel : rightLabel}
                </div>
                <div className="mt-1 text-3xl font-black text-white">{currentBatter ? currentBatter.player_name : "—"}</div>
                {currentBatter && (
                  <div className="mt-0.5 text-xs text-white/40">
                    #{(activeBatterIdx % Math.max(1, battingRoster.length)) + 1} in order · H: {getVal(currentBatter.player_id, "h")} · HR: {getVal(currentBatter.player_id, "hr")}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Outs</div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`h-4 w-4 rounded-full border-2 transition-colors ${i < outsThisHalf ? "border-red-400 bg-red-400" : "border-white/20 bg-transparent"}`} />
                  ))}
                </div>
                <button onClick={addOutOnly}
                  className={`${BTN} rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-[10px] font-black text-red-300 active:scale-95`}>
                  +1 Out
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {AT_BAT_OUTCOMES.map((o) => (
              <button key={o.key} onClick={() => recordAtBat(o)}
                className={`${BTN} rounded-xl border py-4 text-lg font-black active:scale-95 ${OUTCOME_COLORS[o.color]}`}>
                {o.label}
              </button>
            ))}
          </div>

          {lastAtBatSnap && (
            <button onClick={undoLastAtBat}
              className={`${BTN} w-full rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-black text-white/70 active:scale-[0.98]`}>
              ↩ Undo Last At-Bat
            </button>
          )}

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

          <div className="grid grid-cols-2 gap-2">
            {[{ side: "A", roster: playingA, label: leftLabel }, { side: "B", roster: playingB, label: rightLabel }].map(({ side, roster, label }) => (
              <div key={side} className={`rounded-xl border p-2 ${battingTeam === side ? "border-blue-500/30 bg-blue-500/5" : "border-white/5 bg-white/[0.02]"}`}>
                <div className="mb-1 text-[9px] font-black uppercase tracking-wider text-white/40">{label} {battingTeam === side ? "· Batting" : ""}</div>
                <div className="space-y-0.5">
                  {roster.map((p, idx) => {
                    const isUp = battingTeam === side && idx === (activeBatterIdx % Math.max(1, roster.length));
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
      ) : !noStat ? (
        (() => {
          const rosterTeams = [
            { side: "A", label: leftLabel, score: scoreA, playing: playingA, bench: benchA, show: showBenchA, setShow: setShowBenchA, roster: rosterA },
            { side: "B", label: rightLabel, score: scoreB, playing: playingB, bench: benchB, show: showBenchB, setShow: setShowBenchB, roster: rosterB },
          ];
          const active = rosterTeams.find((t) => t.side === activeRosterSide) ?? rosterTeams[0];
          return (
            <div className="p-3">
              {/* One team at a time, full device width — the squeezed
                  side-by-side columns were the main source of tiny,
                  mis-tappable buttons and forced-abbreviated names. */}
              <div className="flex gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5">
                {rosterTeams.map((t) => {
                  const isActive = t.side === activeRosterSide;
                  return (
                    <button key={t.side} onClick={() => setActiveRosterSide(t.side)}
                      className={`${BTN} min-h-11 flex-1 truncate rounded-xl px-3 text-sm font-black active:scale-[0.98] ${
                        isActive ? "text-white" : "text-white/45"}`}
                      style={isActive ? { background: "linear-gradient(180deg,#4d80ff,#3a71ff)" } : {}}>
                      {t.label} · {t.score}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 space-y-2">
                {active.playing.length ? (
                  active.playing.map((p) => {
                    const idx = active.roster.findIndex((x) => x.player_id === p.player_id);
                    return isHoop ? (
                      <HoopPlayerRow key={p.player_id} p={p} side={active.side} isCap={isCapFn(p.player_id)}
                        pts={getVal(p.player_id, "pts")} fouls={getVal(p.player_id, "foul")}
                        onBumpPts={bumpHoopPoints} onUndoPts={undoHoopPoints}
                        onBumpFoul={(pl) => bumpStat(pl, "foul", 1)} onUndoFoul={(pl) => undoStat(pl, "foul")}
                        onToggle={togglePlaying} />
                    ) : (
                      <PlayerRow key={p.player_id} p={p} idx={Math.max(0, idx)} total={active.roster.length} side={active.side}
                        showBatting={isBattingSport(game?.sport)} isCap={isCapFn(p.player_id)}
                        statDefs={statDefs} getVal={getVal}
                        onBumpChip={onBumpChip} onUndoChip={onUndoChip}
                        onToggle={togglePlaying} onMove={moveInOrder} />
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm text-white/40">
                    No one in yet — open bench below and tap In.
                  </div>
                )}
              </div>

              <div className="mt-3">
                <button onClick={() => active.setShow((v) => !v)}
                  className={`${BTN} min-h-11 flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 text-xs font-bold text-white/40`}>
                  <span>Bench ({active.bench.length})</span>
                  <span>{active.show ? "▲" : "▼"}</span>
                </button>
                {active.show && (
                  <div className="mt-2 space-y-1.5">
                    {active.bench.length
                      ? active.bench.map((p) => <BenchRow key={p.player_id} p={p} isCap={isCapFn(p.player_id)} onToggle={togglePlaying} />)
                      : <div className="text-xs text-white/30">No bench.</div>}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        <div className="px-3 pt-3 text-center text-[11px] text-white/30">
          {leftLabel} vs {rightLabel} — no stats tracked for this sport.
        </div>
      )}

      <div className="px-3 pb-8 text-[10px] text-white/20">ID: {String(game.id)}</div>

      {/* ── LINEUP MODAL (softball) ── */}
      {lineupOpen && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/80 sm:items-center sm:justify-center">
          <div className="w-full max-w-2xl rounded-t-3xl border border-white/15 bg-[#08172c] p-5 sm:rounded-3xl">
            <div className="text-xl font-black text-white">Set Lineup</div>
            <div className="mt-0.5 text-xs text-white/50">Mark who's In, set batting order, pick Home team. Then tap Done — this won't reopen.</div>

            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-widest text-white/40">Home team:</span>
              <button onClick={() => setHomeTeam("A")}
                className={`${BTN} rounded-xl border px-4 py-2 text-xs font-black transition ${homeTeam === "A" ? "border-blue-400/60 bg-blue-500/20 text-blue-200" : "border-white/10 bg-white/5 text-white/40"}`}>
                {leftLabel}
              </button>
              <button onClick={() => setHomeTeam("B")}
                className={`${BTN} rounded-xl border px-4 py-2 text-xs font-black transition ${homeTeam === "B" ? "border-blue-400/60 bg-blue-500/20 text-blue-200" : "border-white/10 bg-white/5 text-white/40"}`}>
                {rightLabel}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto">
              {[
                { label: leftLabel, roster: rosterA, playing: playingA },
                { label: rightLabel, roster: rosterB, playing: playingB },
              ].map(({ label, roster, playing }, colIdx) => (
                <div key={colIdx}>
                  <div className="mb-2 text-xs font-black uppercase tracking-wider text-white/60">{label}</div>
                  <div className="space-y-1">
                    {[...roster].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((p) => (
                      <div key={p.player_id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${p.is_playing ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/5 bg-white/[0.02]"}`}>
                        {p.is_playing
                          ? <span className="w-4 text-center text-[10px] font-black text-white/50">{playing.findIndex((x) => x.player_id === p.player_id) + 1}</span>
                          : <span className="w-4" />}
                        <span className="flex-1 truncate text-[11px] font-semibold text-white">{p.player_name}</span>
                        <div className="flex items-center gap-0.5">
                          {p.is_playing && (
                            <>
                              <button onClick={() => moveInOrder(p, "up")} className={`${BTN} rounded border border-white/10 bg-white/10 px-1.5 py-1 text-[9px] font-black`}>↑</button>
                              <button onClick={() => moveInOrder(p, "down")} className={`${BTN} rounded border border-white/10 bg-white/10 px-1.5 py-1 text-[9px] font-black`}>↓</button>
                            </>
                          )}
                          <button onClick={() => togglePlaying(p)}
                            className={`${BTN} rounded-lg border px-2.5 py-1 text-[10px] font-black ${p.is_playing ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
                            {p.is_playing ? "Out" : "In"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const awayTeam = homeTeam === "A" ? "B" : "A";
                setBattingTeam(awayTeam);
                setBatterIdxA(0);
                setBatterIdxB(0);
                setOutsThisHalf(0);
                setLineupDone(true);
                setLineupOpen(false);
                saveSoftballState({
                  battingTeam: awayTeam, batterIdxA: 0, batterIdxB: 0,
                  outsThisHalf: 0, lineupDone: true, inning: 1, inningHalf: "top",
                });
              }}
              className={`${BTN} mt-5 w-full rounded-2xl bg-blue-600 py-4 text-base font-black text-white active:scale-[0.98]`}>
              Done — Start Game
            </button>
          </div>
        </div>
      )}

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
              <button onClick={() => setSetTimeOpen(false)} className={`${BTN} flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold`}>Cancel</button>
              <button className={`${BTN} flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-black`}
                onClick={async () => {
                  const seconds = parseMMSS(timeInput);
                  if (seconds === null) { setErr("Time must be in mm:ss format (example: 11:05)."); return; }
                  setSetTimeOpen(false);
                  await setExactRemaining(seconds);
                }}>Set Time</button>
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
            {rules?.clock?.enabled && game.timer_running && (
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
              <button onClick={() => setConfirmFinalizeOpen(false)} className={`${BTN} flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold`}>Cancel</button>
              <button disabled={(rules?.clock?.enabled && game.timer_running) || finalizing}
                className={`${BTN} flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 font-black disabled:opacity-40`}
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