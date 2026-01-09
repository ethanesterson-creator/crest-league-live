"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

const OVERALL_SPORT_KEY = "overall";
const HIGHLIGHTS_BUCKET = "highlights";

const SPORTS = [
  "Hoop",
  "Soccer",
  "Softball",
  "Volleyball",
  "Football",
  "Speedball",
  "Euro",
  "Hockey",
];

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

export default function DisplayBoardPage() {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState("seniors");

  const [tab, setTab] = useState("league"); // league | camp | leaders | recent | highlights

  // standings
  const [leagueRows, setLeagueRows] = useState([]);
  const [allStandingsRows, setAllStandingsRows] = useState([]);

  // leaders
  const [sport, setSport] = useState("Hoop");
  const rules = useMemo(() => getSportRules(sport), [sport]);
  const statOptions = useMemo(() => rules?.stats ?? [], [rules]);
  const [statKey, setStatKey] = useState("pts");
  const [leaderRows, setLeaderRows] = useState([]);

  // recent finals
  const [recentFinals, setRecentFinals] = useState([]);

  // highlights
  const [highlights, setHighlights] = useState([]);
  const [hiIndex, setHiIndex] = useState(0);
  const [hiAuto, setHiAuto] = useState(true);

  // auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const first = statOptions?.[0]?.key;
    if (first) setStatKey(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  async function loadLeagues() {
    const { data, error } = await supabase
      .from("leagues")
      .select("id, name")
      .order("id", { ascending: true });

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

  function sortStandings(data) {
    return (data || []).slice().sort((a, b) => {
      const ap = Number(a.league_points || 0);
      const bp = Number(b.league_points || 0);
      if (bp !== ap) return bp - ap;

      const aw = Number(a.wins || 0);
      const bw = Number(b.wins || 0);
      if (bw !== aw) return bw - aw;

      const ad = Number(a.points_for || 0) - Number(a.points_against || 0);
      const bd = Number(b.points_for || 0) - Number(b.points_against || 0);
      return bd - ad;
    });
  }

  async function loadLeagueStandings(lid) {
    const { data, error } = await supabase
      .from("standings")
      .select(
        "league_id, sport, team_name, wins, losses, points_for, points_against, league_points"
      )
      .eq("league_id", norm(lid))
      .eq("sport", OVERALL_SPORT_KEY);

    if (error) throw error;
    setLeagueRows(sortStandings(data));
  }

  async function loadAllStandings() {
    const { data, error } = await supabase
      .from("standings")
      .select(
        "league_id, sport, team_name, wins, losses, points_for, points_against, league_points"
      )
      .eq("sport", OVERALL_SPORT_KEY);

    if (error) throw error;
    setAllStandingsRows(data || []);
  }

  const campRows = useMemo(() => {
    const map = new Map();
    for (const r of allStandingsRows) {
      const key = norm(r.team_name);
      const cur = map.get(key) || {
        team_name: r.team_name,
        league_points: 0,
        wins: 0,
        losses: 0,
        points_for: 0,
        points_against: 0,
      };
      cur.league_points += Number(r.league_points || 0);
      cur.wins += Number(r.wins || 0);
      cur.losses += Number(r.losses || 0);
      cur.points_for += Number(r.points_for || 0);
      cur.points_against += Number(r.points_against || 0);
      map.set(key, cur);
    }
    return sortStandings(Array.from(map.values()));
  }, [allStandingsRows]);

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
        "id, league_id, sport, level, team_a, team_b, score_a, score_b, status, created_at, updated_at, duration_seconds"
      )
      .eq("status", "final")
      .order("updated_at", { ascending: false })
      .limit(8);

    if (error) throw error;
    setRecentFinals(data || []);
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
    setHiIndex(0);
  }

  function highlightUrl(path) {
    const { data } = supabase.storage.from(HIGHLIGHTS_BUCKET).getPublicUrl(path);
    return data?.publicUrl;
  }

  async function refreshAll({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setErr("");

    try {
      await loadAllStandings();
      await loadLeagueStandings(leagueId);
      await loadLeaders();
      await loadRecentFinals();
      await loadHighlightsBoard();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadLeagues();
      await refreshAll({ quiet: true });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshAll({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, sport, statKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => refreshAll({ quiet: true }), 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, leagueId, sport, statKey]);

  async function goFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }

  const statLabel = useMemo(() => {
    const def = (rules?.stats ?? []).find((x) => norm(x.key) === norm(statKey));
    return def?.label ?? String(statKey ?? "").toUpperCase();
  }, [rules, statKey]);

  const topTitle = useMemo(() => {
    if (tab === "league") return `${prettyLeague(leagueId)} Standings`;
    if (tab === "camp") return "Overall Camp Standings";
    if (tab === "leaders") return `${prettyLeague(leagueId)} Stat Leaders • ${sport} • ${statLabel}`;
    if (tab === "highlights") return "Highlights";
    return "Recent Final Games";
  }, [tab, leagueId, sport, statLabel]);

  // Auto-advance highlights: images advance every 8s; videos advance when ended
  const activeHighlight = highlights?.length ? highlights[Math.max(0, Math.min(hiIndex, highlights.length - 1))] : null;

  useEffect(() => {
    if (tab !== "highlights") return;
    if (!hiAuto) return;
    if (!highlights?.length) return;

    const h = activeHighlight;
    if (!h) return;

    // For images: auto advance on a timer
    if (h.file_type === "image") {
      const t = setInterval(() => {
        setHiIndex((i) => (i + 1) % highlights.length);
      }, 8000);
      return () => clearInterval(t);
    }

    // For videos: we do NOT auto-advance by time. We advance on "ended" event (in component).
    return;
  }, [tab, hiAuto, highlights, activeHighlight]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Top Bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-3xl font-black tracking-tight">{topTitle}</div>
            <div className="mt-1 text-sm text-white/70">
              Display Board • Auto-refresh {autoRefresh ? "ON" : "OFF"} • Bauercrest Navy/White
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => refreshAll()}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
            >
              Refresh
            </button>

            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
            >
              Auto: {autoRefresh ? "ON" : "OFF"}
            </button>

            <button
              onClick={goFullscreen}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
            >
              Fullscreen
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "league", label: "League Standings" },
                { id: "camp", label: "Overall Camp" },
                { id: "leaders", label: "Stat Leaders" },
                { id: "recent", label: "Recent Finals" },
                { id: "highlights", label: "Highlights" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-black active:scale-95 ${
                    tab === t.id
                      ? "bg-white text-slate-950"
                      : "border border-white/15 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-xs font-bold text-white/60">League</div>
                <select
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
                  value={leagueId}
                  onChange={(e) => setLeagueId(e.target.value)}
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

              {tab === "leaders" ? (
                <>
                  <div>
                    <div className="mb-1 text-xs font-bold text-white/60">Sport</div>
                    <select
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
                      value={sport}
                      onChange={(e) => setSport(e.target.value)}
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
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
                      value={statKey}
                      onChange={(e) => setStatKey(e.target.value)}
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

              {tab === "highlights" ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHiAuto((v) => !v)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
                  >
                    Auto: {hiAuto ? "ON" : "OFF"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {/* Board Content */}
        <div className="mt-5">
          {loading ? (
            <div className="text-white/70">Loading…</div>
          ) : tab === "league" ? (
            <BoardStandings title={`${prettyLeague(leagueId)} Standings`} rows={leagueRows} />
          ) : tab === "camp" ? (
            <BoardStandings title="Overall Camp Standings" rows={campRows} />
          ) : tab === "leaders" ? (
            <BoardLeaders title={`${prettyLeague(leagueId)} Leaders`} rows={leaderRows} statLabel={statLabel} />
          ) : tab === "recent" ? (
            <BoardRecent finals={recentFinals} />
          ) : (
            <BoardHighlights
              items={highlights}
              index={hiIndex}
              setIndex={setHiIndex}
              highlightUrl={highlightUrl}
              onVideoEnded={() => {
                setHiIndex((i) => (highlights?.length ? (i + 1) % highlights.length : 0));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BoardStandings({ title, rows }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-2xl font-black">{title}</div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-sm text-white/70">
            <tr className="border-b border-white/10">
              <th className="py-3">Team</th>
              <th className="py-3 text-right">W</th>
              <th className="py-3 text-right">L</th>
              <th className="py-3 text-right">PF</th>
              <th className="py-3 text-right">PA</th>
              <th className="py-3 text-right">Pts</th>
            </tr>
          </thead>
          <tbody className="text-lg">
            {rows?.length ? (
              rows.map((r) => (
                <tr key={`${r.team_name}`} className="border-t border-white/10">
                  <td className="py-4 font-extrabold">{r.team_name}</td>
                  <td className="py-4 text-right font-black tabular-nums">{r.wins}</td>
                  <td className="py-4 text-right font-black tabular-nums">{r.losses}</td>
                  <td className="py-4 text-right font-black tabular-nums">{r.points_for}</td>
                  <td className="py-4 text-right font-black tabular-nums">{r.points_against}</td>
                  <td className="py-4 text-right font-black tabular-nums">{r.league_points}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-6 text-white/60" colSpan={6}>
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

function BoardLeaders({ title, rows, statLabel }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-baseline justify-between">
        <div className="text-2xl font-black">{title}</div>
        <div className="text-sm text-white/70">Top 12 • {statLabel}</div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-sm text-white/70">
            <tr className="border-b border-white/10">
              <th className="py-3">#</th>
              <th className="py-3">Player</th>
              <th className="py-3">Team</th>
              <th className="py-3 text-right">{statLabel}</th>
            </tr>
          </thead>
          <tbody className="text-lg">
            {rows?.length ? (
              rows.map((r, idx) => (
                <tr key={`${r.player_id}-${r.stat_key}`} className="border-t border-white/10">
                  <td className="py-4 font-black tabular-nums">{idx + 1}</td>
                  <td className="py-4 font-extrabold">{r.player_name}</td>
                  <td className="py-4 text-white/85">{r.team_name}</td>
                  <td className="py-4 text-right font-black tabular-nums">{r.value}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-6 text-white/60" colSpan={4}>
                  No leaders yet for this filter. Finalize games to populate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoardRecent({ finals }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-2xl font-black">Recent Final Games</div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {finals?.length ? (
          finals.map((g) => (
            <div key={g.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs text-white/60">
                {prettyLeague(g.league_id)} • {String(g.sport || "").toUpperCase()} • Level {g.level}
              </div>

              <div className="mt-2 text-xl font-extrabold">
                {g.team_a} vs {g.team_b}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="text-sm text-white/60">Final</div>
                <div className="text-3xl font-black tabular-nums">
                  {g.score_a} - {g.score_b}
                </div>
              </div>

              <div className="mt-2 text-xs text-white/50">
                Updated: {g.updated_at ? new Date(g.updated_at).toLocaleString() : "—"} • Duration:{" "}
                {g.duration_seconds ? fmtClock(g.duration_seconds) : "—"}
              </div>
            </div>
          ))
        ) : (
          <div className="text-white/60">No finalized games yet.</div>
        )}
      </div>
    </div>
  );
}

function BoardHighlights({ items, index, setIndex, highlightUrl, onVideoEnded }) {
  const has = !!items?.length;
  const safeIndex = has ? Math.max(0, Math.min(index, items.length - 1)) : 0;
  const h = has ? items[safeIndex] : null;

  const url = h ? highlightUrl(h.file_path) : null;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-black">Highlights</div>
          <div className="text-sm text-white/70">
            {has ? `Showing ${safeIndex + 1} of ${items.length}` : "No highlights marked for the board yet."}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIndex((i) => (has ? (i - 1 + items.length) % items.length : 0))}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10"
            disabled={!has}
          >
            Prev
          </button>
          <button
            onClick={() => setIndex((i) => (has ? (i + 1) % items.length : 0))}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10"
            disabled={!has}
          >
            Next
          </button>

          <a
            href="/highlights"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10"
          >
            Manage →
          </a>
        </div>
      </div>

      {!has ? null : (
        <div className="mt-5">
          <div className="text-xs text-white/60">
            {prettyLeague(h.league_id)} • {h.sport} • {h.team_name ? h.team_name : "—"} •{" "}
            {new Date(h.created_at).toLocaleString()}
          </div>

          <div className="mt-1 text-xl font-extrabold">{h.title ? h.title : "Highlight"}</div>
          {h.notes ? <div className="mt-1 text-sm text-white/70">{h.notes}</div> : null}

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            {h.file_type === "video" ? (
              <video
                src={url}
                controls
                className="w-full"
                onEnded={onVideoEnded}
                playsInline
              />
            ) : (
              <img src={url} alt={h.title ?? "Highlight"} className="w-full object-contain" />
            )}
          </div>

          <div className="mt-3 text-xs text-white/50">
            Tip: For long videos, use “Next” when you’re ready. Videos advance automatically when they finish.
          </div>
        </div>
      )}
    </div>
  );
}
