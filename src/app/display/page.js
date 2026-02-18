"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

const OVERALL_SPORT_KEY = "overall";
const HIGHLIGHTS_BUCKET = "highlights";

// Scenes for TV rotation
const SCENES = [
  { id: "league", label: "League Standings" },
  { id: "camp", label: "Camp Standings" },
  { id: "live", label: "Live Now" },
  { id: "recent", label: "Recent Finals" },
  { id: "leaders", label: "Stat Leaders" },
  { id: "highlights", label: "Highlights" },
];

const SPORTS = ["Hoop", "Soccer", "Softball", "Volleyball", "Football", "Speedball", "Euro", "Hockey"];

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}
function prettyLeague(id) {
  const x = String(id || "");
  if (x === "sophomores") return "Sophomores";
  if (x === "juniors") return "Juniors";
  if (x === "seniors") return "Seniors";
  return x;
}
function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds ?? 0)));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
function matchupLabel(a1, a2) {
  const x1 = norm(a1);
  const x2 = norm(a2);
  if (x1 && x2 && x1 !== x2) return `${x1} + ${x2}`;
  return x1 || "—";
}
function sortStandings(rows) {
  const data = (rows || []).slice();
  data.sort((a, b) => {
    const ap = Number(a.league_points || 0);
    const bp = Number(b.league_points || 0);
    if (bp !== ap) return bp - ap;

    const aw = Number(a.wins || 0);
    const bw = Number(b.wins || 0);
    if (bw !== aw) return bw - aw;

    return String(a.team_name || "").localeCompare(String(b.team_name || ""));
  });
  return data;
}

function badgeClass(kind) {
  if (kind === "bowl") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (kind === "ex") return "border-slate-300/20 bg-slate-500/10 text-slate-100";
  if (kind === "live") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  return "border-white/15 bg-white/5 text-white";
}

export default function DisplayBoardPage() {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // header clock
  const [now, setNow] = useState(new Date());

  // global controls
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);

  // rotation pacing (seconds)
  const [rotateSeconds, setRotateSeconds] = useState(18);

  // league + scene
  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState("seniors");
  const [scene, setScene] = useState("league");

  // standings
  const [leagueRows, setLeagueRows] = useState([]);
  const [allStandingsRows, setAllStandingsRows] = useState([]);

  // live now
  const [liveGames, setLiveGames] = useState([]);

  // recent finals
  const [recentFinals, setRecentFinals] = useState([]);

  // leaders
  const [sport, setSport] = useState("Hoop");
  const rules = useMemo(() => getSportRules(sport), [sport]);
  const statOptions = useMemo(() => rules?.stats ?? [], [rules]);
  const [statKey, setStatKey] = useState("pts");
  const [leaderRows, setLeaderRows] = useState([]);

  // highlights
  const [highlights, setHighlights] = useState([]);
  const [hiIndex, setHiIndex] = useState(0);
  const [hiAuto, setHiAuto] = useState(true);

  // manual override timer (prevents “fighting” the user)
  const rotateLockUntil = useRef(0);

  // keep statKey valid when sport changes
  useEffect(() => {
    const first = statOptions?.[0]?.key;
    if (first) setStatKey(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  // tick the header clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function loadLeagues() {
    const { data, error } = await supabase.from("leagues").select("id, name").order("id", { ascending: true });
    if (error) {
      setLeagues([
        { id: "sophomores", name: "Sophomores" },
        { id: "juniors", name: "Juniors" },
        { id: "seniors", name: "Seniors" },
      ]);
      return;
    }
    setLeagues(data || []);
  }

  async function loadLeagueStandings(lid) {
    const { data, error } = await supabase
      .from("standings")
      .select("league_id, sport, team_name, wins, losses, league_points")
      .eq("league_id", norm(lid))
      .eq("sport", OVERALL_SPORT_KEY);

    if (error) throw error;
    setLeagueRows(sortStandings(data));
  }

  async function loadAllStandings() {
    const { data, error } = await supabase
      .from("standings")
      .select("league_id, sport, team_name, wins, losses, league_points")
      .eq("sport", OVERALL_SPORT_KEY);

    if (error) throw error;
    setAllStandingsRows(data || []);
  }

  const campRows = useMemo(() => {
    const map = new Map();
    for (const r of allStandingsRows || []) {
      const key = norm(r.team_name);
      const cur = map.get(key) || { team_name: r.team_name, league_points: 0, wins: 0, losses: 0 };
      cur.league_points += Number(r.league_points || 0);
      cur.wins += Number(r.wins || 0);
      cur.losses += Number(r.losses || 0);
      map.set(key, cur);
    }
    return sortStandings(Array.from(map.values()));
  }, [allStandingsRows]);

  async function loadLiveNow() {
    // Your app uses live_games.status = "active" for live
    const { data, error } = await supabase
      .from("live_games")
      .select(
        [
          "id",
          "created_at",
          "league_key",
          "sport",
          "level",
          "mode",
          "matchup_type",
          "team_a1",
          "team_a2",
          "team_b1",
          "team_b2",
          "score_a",
          "score_b",
          "status",
          "is_staff_game",
          "duration_seconds",
          "timer_running",
          "timer_remaining_seconds",
          "timer_remaining_at_anchor",
          "timer_anchor_ts",
          "is_bowl_game",
          "bowl_name",
          "bowl_counts",
        ].join(",")
      )
      .eq("status", "active")
      .is("played_on", null)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) throw error;
    setLiveGames(data || []);
  }

  async function loadLeaders() {
    const { data, error } = await supabase
      .from("player_totals")
      .select("league_id, sport, player_id, player_name, team_name, stat_key, value")
      .eq("league_id", norm(leagueId))
      .eq("sport", norm(sport))
      .eq("stat_key", norm(statKey))
      .order("value", { ascending: false })
      .limit(12);

    if (error) throw error;
    setLeaderRows(data || []);
  }

  async function loadRecentFinals() {
    const { data, error } = await supabase
      .from("games")
      .select(
        [
          "id",
          "league_id",
          "sport",
          "level",
          "team_a",
          "team_b",
          "team_a2",
          "team_b2",
          "matchup_type",
          "score_a",
          "score_b",
          "status",
          "updated_at",
          "duration_seconds",
          "is_bowl_game",
          "bowl_name",
          "bowl_counts",
        ].join(",")
      )
      .eq("status", "final")
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    // Filter finals to those that still exist in live_games (so admin deletions disappear)
    const ids = (data || []).map((g) => g.id);
    if (!ids.length) {
      setRecentFinals([]);
      return;
    }

    const { data: lg, error: lgErr } = await supabase.from("live_games").select("id").in("id", ids);
    if (lgErr) throw lgErr;

    const liveSet = new Set((lg || []).map((x) => x.id));
    const filtered = (data || []).filter((g) => liveSet.has(g.id));

    setRecentFinals(filtered.slice(0, 10));
  }

  async function loadHighlightsBoard() {
    const { data, error } = await supabase
      .from("highlights")
      .select("id, created_at, league_id, sport, team_name, title, notes, file_path, file_type, show_on_board")
      .eq("show_on_board", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    setHighlights(data || []);
    setHiIndex((i) => Math.min(i, Math.max(0, (data || []).length - 1)));
  }

  function highlightUrl(path) {
    const { data } = supabase.storage.from(HIGHLIGHTS_BUCKET).getPublicUrl(path);
    return data?.publicUrl;
  }

  async function refreshAll({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setErr("");

    try {
      await Promise.all([loadAllStandings(), loadLeagueStandings(leagueId), loadLiveNow(), loadLeaders(), loadRecentFinals(), loadHighlightsBoard()]);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadLeagues();
      await refreshAll({ quiet: true });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refresh on filter changes
  useEffect(() => {
    refreshAll({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, sport, statKey]);

  // periodic refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => refreshAll({ quiet: true }), 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, leagueId, sport, statKey]);

  // rotation engine
  useEffect(() => {
    if (!autoRotate) return;
    const t = setInterval(() => {
      const nowMs = Date.now();
      if (nowMs < rotateLockUntil.current) return;

      setScene((cur) => {
        const idx = SCENES.findIndex((s) => s.id === cur);
        const next = SCENES[(idx + 1 + SCENES.length) % SCENES.length];
        return next.id;
      });
    }, Math.max(8, Number(rotateSeconds || 18)) * 1000);

    return () => clearInterval(t);
  }, [autoRotate, rotateSeconds]);

  // highlights auto-advance when scene is highlights
  useEffect(() => {
    if (scene !== "highlights") return;
    if (!hiAuto) return;
    if (!highlights?.length) return;

    const h = highlights[Math.max(0, Math.min(hiIndex, highlights.length - 1))];
    if (!h) return;

    // Images rotate every 8s; videos advance on ended (handled in component)
    if (h.file_type === "image") {
      const t = setInterval(() => setHiIndex((i) => (i + 1) % highlights.length), 8000);
      return () => clearInterval(t);
    }
  }, [scene, hiAuto, highlights, hiIndex]);

  async function goFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // ignore
    }
  }

  function manualScene(next) {
    rotateLockUntil.current = Date.now() + 45_000; // don’t auto-rotate for 45s after manual touch
    setScene(next);
  }

  const statLabel = useMemo(() => {
    const def = (rules?.stats ?? []).find((x) => norm(x.key) === norm(statKey));
    return def?.label ?? String(statKey ?? "").toUpperCase();
  }, [rules, statKey]);

  const title = useMemo(() => {
    if (scene === "league") return `${prettyLeague(leagueId)} Standings`;
    if (scene === "camp") return `Overall Camp Standings`;
    if (scene === "live") return `Live Now`;
    if (scene === "recent") return `Recent Finals`;
    if (scene === "leaders") return `${prettyLeague(leagueId)} Leaders • ${sport} • ${statLabel}`;
    return `Highlights`;
  }, [scene, leagueId, sport, statLabel]);

  return (
    <div className="min-h-screen bg-[#050b16] text-white">
      {/* subtle background glow */}
      <div className="pointer-events-none fixed inset-0 opacity-40 blur-3xl"
           style={{
             background:
               "radial-gradient(700px 400px at 20% 20%, rgba(56,189,248,.25), transparent 60%)," +
               "radial-gradient(700px 400px at 80% 30%, rgba(34,197,94,.20), transparent 60%)," +
               "radial-gradient(900px 500px at 50% 90%, rgba(245,158,11,.18), transparent 60%)",
           }}
      />

      <div className="relative mx-auto max-w-7xl px-6 py-6">
        {/* Top ribbon */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-baseline gap-4">
            <div className="text-4xl font-black tracking-tight">Crest League</div>
            <div className="hidden md:block text-white/50 font-semibold">Mess Hall Board</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/90">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>

            <button
              onClick={() => refreshAll()}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10"
            >
              Refresh
            </button>

            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10"
            >
              Auto Refresh: {autoRefresh ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => setAutoRotate((v) => !v)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10"
            >
              Show Mode: {autoRotate ? "ON" : "OFF"}
            </button>

            <button
              onClick={goFullscreen}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10"
            >
              Fullscreen
            </button>

            <Link
              href="/"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10"
            >
              Home
            </Link>
          </div>
        </div>

        {/* Control strip */}
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {SCENES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => manualScene(s.id)}
                  className={`rounded-2xl px-4 py-2 text-sm font-black transition active:scale-95 ${
                    scene === s.id ? "bg-white text-slate-950" : "border border-white/15 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-xs font-bold text-white/60">League</div>
                <select
                  className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-black text-white"
                  value={leagueId}
                  onChange={(e) => {
                    rotateLockUntil.current = Date.now() + 45_000;
                    setLeagueId(e.target.value);
                  }}
                >
                  {(leagues?.length
                    ? leagues
                    : [
                        { id: "sophomores", name: "Sophomores" },
                        { id: "juniors", name: "Juniors" },
                        { id: "seniors", name: "Seniors" },
                      ]
                  ).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name ?? prettyLeague(l.id)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold text-white/60">Rotate</div>
                <select
                  className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-black text-white"
                  value={String(rotateSeconds)}
                  onChange={(e) => setRotateSeconds(Number(e.target.value))}
                >
                  {[12, 15, 18, 22, 30].map((s) => (
                    <option key={s} value={s}>
                      {s}s
                    </option>
                  ))}
                </select>
              </div>

              {scene === "leaders" ? (
                <>
                  <div>
                    <div className="mb-1 text-xs font-bold text-white/60">Sport</div>
                    <select
                      className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-black text-white"
                      value={sport}
                      onChange={(e) => {
                        rotateLockUntil.current = Date.now() + 45_000;
                        setSport(e.target.value);
                      }}
                    >
                      {SPORTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-bold text-white/60">Stat</div>
                    <select
                      className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-black text-white"
                      value={statKey}
                      onChange={(e) => {
                        rotateLockUntil.current = Date.now() + 45_000;
                        setStatKey(e.target.value);
                      }}
                    >
                      {statOptions.map((st) => (
                        <option key={st.key} value={st.key}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}

              {scene === "highlights" ? (
                <button
                  onClick={() => setHiAuto((v) => !v)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10"
                >
                  Highlights Auto: {hiAuto ? "ON" : "OFF"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-2xl font-black tracking-tight">{title}</div>
            <div className="text-sm text-white/60">
              {autoRotate ? "Auto rotating" : "Manual mode"} • {autoRefresh ? "Auto refreshing" : "Refresh paused"}
            </div>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-red-700 bg-red-950/40 p-4 text-sm text-red-200">{err}</div>
        ) : null}

        {/* Main content */}
        <div className="mt-6">
          {loading ? (
            <div className="text-white/70">Loading…</div>
          ) : scene === "league" ? (
            <SceneStandings title={`${prettyLeague(leagueId)} Standings`} rows={leagueRows} />
          ) : scene === "camp" ? (
            <SceneStandings title="Overall Camp Standings" rows={campRows} />
          ) : scene === "live" ? (
            <SceneLiveNow games={liveGames} />
          ) : scene === "recent" ? (
            <SceneRecent finals={recentFinals} />
          ) : scene === "leaders" ? (
            <SceneLeaders title={`${prettyLeague(leagueId)} Leaders`} rows={leaderRows} statLabel={statLabel} />
          ) : (
            <SceneHighlights
              items={highlights}
              index={hiIndex}
              setIndex={(fnOrVal) => {
                rotateLockUntil.current = Date.now() + 45_000;
                setHiIndex(fnOrVal);
              }}
              highlightUrl={highlightUrl}
              onVideoEnded={() => setHiIndex((i) => (highlights?.length ? (i + 1) % highlights.length : 0))}
            />
          )}
        </div>

        {/* Footer hint (small) */}
        <div className="mt-6 pb-8 text-xs text-white/40">
          Tip: Turn on Fullscreen for the mess hall monitor.
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Scenes ------------------------- */

function SceneStandings({ title, rows }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-3xl font-black">{title}</div>
        <div className="text-white/60 text-sm font-semibold">Overall points • W/L for reference</div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full">
          <thead className="text-white/60">
            <tr className="border-b border-white/10 text-sm">
              <th className="py-3 text-left">Team</th>
              <th className="py-3 text-right">W</th>
              <th className="py-3 text-right">L</th>
              <th className="py-3 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows?.length ? (
              rows.map((r, idx) => (
                <tr key={`${r.team_name}`} className="border-t border-white/10">
                  <td className="py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 text-center text-white/60 font-black tabular-nums">{idx + 1}</div>
                      <div className="text-3xl font-black tracking-tight">{r.team_name}</div>
                    </div>
                  </td>
                  <td className="py-5 text-right text-2xl font-black tabular-nums">{r.wins}</td>
                  <td className="py-5 text-right text-2xl font-black tabular-nums">{r.losses}</td>
                  <td className="py-5 text-right text-3xl font-black tabular-nums">{r.league_points}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-10 text-white/60" colSpan={4}>
                  No standings yet. Finalize games to populate this board.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SceneLiveNow({ games }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-3xl font-black">Live Now</div>
        <div className="text-white/60 text-sm font-semibold">Active games (counselors running now)</div>
      </div>

      {!games?.length ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-6 text-white/70">
          No live games at the moment.
        </div>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {games.map((g) => {
            const left = g.matchup_type === "two_team" ? matchupLabel(g.team_a1, g.team_a2) : norm(g.team_a1);
            const right = g.matchup_type === "two_team" ? matchupLabel(g.team_b1, g.team_b2) : norm(g.team_b1);

            const bowlOn = !!g.is_bowl_game;
            const bowlLabel = String(g.bowl_name || "").trim();
            const counts = g.bowl_counts !== false;

            return (
              <div key={g.id} className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-white/70 text-sm font-bold">
                    {prettyLeague(g.league_key)} • {String(g.sport || "").toUpperCase()} • Level {g.level} • {g.mode}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${badgeClass("live")}`}>
                      LIVE
                    </span>

                    {bowlOn ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${badgeClass("bowl")}`}>
                        BOWL{bowlLabel ? `: ${bowlLabel}` : ""}
                      </span>
                    ) : null}

                    {bowlOn && !counts ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${badgeClass("ex")}`}>
                        EXHIBITION
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-white/60 text-xs font-bold">HOME</div>
                    <div className="mt-1 text-2xl font-black truncate">{left}</div>
                    <div className="mt-2 text-5xl font-black tabular-nums">{Number(g.score_a || 0)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/60 text-xs font-bold">AWAY</div>
                    <div className="mt-1 text-2xl font-black truncate">{right}</div>
                    <div className="mt-2 text-5xl font-black tabular-nums">{Number(g.score_b || 0)}</div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-white/50 break-all">ID: {g.id}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SceneRecent({ finals }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-3xl font-black">Recent Finals</div>
        <div className="text-white/60 text-sm font-semibold">Last results</div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {finals?.length ? (
          finals.slice(0, 8).map((g) => {
            const left = g.matchup_type === "two_team" ? matchupLabel(g.team_a, g.team_a2) : norm(g.team_a);
            const right = g.matchup_type === "two_team" ? matchupLabel(g.team_b, g.team_b2) : norm(g.team_b);

            const bowlOn = !!g.is_bowl_game;
            const bowlLabel = String(g.bowl_name || "").trim();
            const counts = g.bowl_counts !== false;

            return (
              <div key={g.id} className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-white/70 text-sm font-bold">
                    {prettyLeague(g.league_id)} • {String(g.sport || "").toUpperCase()} • Level {g.level}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {bowlOn ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${badgeClass("bowl")}`}>
                        BOWL{bowlLabel ? `: ${bowlLabel}` : ""}
                      </span>
                    ) : null}
                    {bowlOn && !counts ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${badgeClass("ex")}`}>
                        EXHIBITION
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 text-2xl font-black">
                  {left} <span className="text-white/50">vs</span> {right}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-white/60 text-sm font-semibold">FINAL</div>
                  <div className="text-5xl font-black tabular-nums">
                    {Number(g.score_a || 0)} - {Number(g.score_b || 0)}
                  </div>
                </div>

                <div className="mt-3 text-xs text-white/50">
                  Updated: {g.updated_at ? new Date(g.updated_at).toLocaleString() : "—"} • Duration:{" "}
                  {g.duration_seconds ? fmtClock(g.duration_seconds) : "—"}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-white/60">No finalized games yet.</div>
        )}
      </div>
    </div>
  );
}

function SceneLeaders({ title, rows, statLabel }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-3xl font-black">{title}</div>
        <div className="text-white/60 text-sm font-semibold">Top 12 • {statLabel}</div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full">
          <thead className="text-white/60">
            <tr className="border-b border-white/10 text-sm">
              <th className="py-3 text-left">#</th>
              <th className="py-3 text-left">Player</th>
              <th className="py-3 text-left">Team</th>
              <th className="py-3 text-right">{statLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows?.length ? (
              rows.map((r, idx) => (
                <tr key={`${r.player_id}-${r.stat_key}-${idx}`} className="border-t border-white/10">
                  <td className="py-5 text-2xl font-black tabular-nums text-white/70">{idx + 1}</td>
                  <td className="py-5 text-2xl font-black">{r.player_name}</td>
                  <td className="py-5 text-2xl font-semibold text-white/85">{r.team_name}</td>
                  <td className="py-5 text-right text-3xl font-black tabular-nums">{r.value}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-10 text-white/60" colSpan={4}>
                  No leaders yet. Finalize games to populate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SceneHighlights({ items, index, setIndex, highlightUrl, onVideoEnded }) {
  const has = !!items?.length;
  const safeIndex = has ? Math.max(0, Math.min(index, items.length - 1)) : 0;
  const h = has ? items[safeIndex] : null;
  const url = h ? highlightUrl(h.file_path) : null;

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-3xl font-black">Highlights</div>
          <div className="text-white/60 text-sm font-semibold">
            {has ? `Showing ${safeIndex + 1} of ${items.length}` : "No highlights marked for the board yet."}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIndex((i) => (has ? (i - 1 + items.length) % items.length : 0))}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-black hover:bg-white/10"
            disabled={!has}
          >
            Prev
          </button>
          <button
            onClick={() => setIndex((i) => (has ? (i + 1) % items.length : 0))}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-black hover:bg-white/10"
            disabled={!has}
          >
            Next
          </button>

          <a
            href="/highlights"
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-black hover:bg-white/10"
          >
            Manage →
          </a>
        </div>
      </div>

      {!has ? null : (
        <div className="mt-6">
          <div className="text-white/60 text-sm font-semibold">
            {prettyLeague(h.league_id)} • {String(h.sport || "").toUpperCase()} • {h.team_name || "—"} •{" "}
            {new Date(h.created_at).toLocaleString()}
          </div>

          <div className="mt-2 text-3xl font-black">{h.title ? h.title : "Highlight"}</div>
          {h.notes ? <div className="mt-2 text-white/70 text-lg">{h.notes}</div> : null}

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/35">
            {h.file_type === "video" ? (
              <video src={url} controls className="w-full" onEnded={onVideoEnded} playsInline />
            ) : (
              <img src={url} alt={h.title ?? "Highlight"} className="w-full object-contain" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
