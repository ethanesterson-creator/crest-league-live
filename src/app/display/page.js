"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const SCENES = [
  "camp",
  "live",
  "finals",
  "leaders_seniors",
  "leaders_juniors",
  "leaders_sophomores",
  "highlights",
];

const SCENE_LABELS = {
  camp: "Camp Standings",
  live: "Live Now",
  finals: "Recent Finals",
  leaders_seniors: "Seniors Stat Leaders",
  leaders_juniors: "Juniors Stat Leaders",
  leaders_sophomores: "Sophomores Stat Leaders",
  highlights: "Highlights",
};

const TICKER_MESSAGES = [];

function cx(...x) {
  return x.filter(Boolean).join(" ");
}

function fmtLeague(id) {
  if (!id) return "";
  const s = String(id).toLowerCase();
  if (s === "seniors") return "Seniors";
  if (s === "juniors") return "Juniors";
  if (s === "sophomores") return "Sophomores";
  return id;
}

function fmtSport(s) {
  return String(s || "").toUpperCase();
}

function fmtClock(d) {
  return new Date(d).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DisplayPage() {
  const [scene, setScene] = useState("standings");
  const [league, setLeague] = useState("seniors");

  const [standings, setStandings] = useState([]);
  const [campStandings, setCampStandings] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
  const [finalGames, setFinalGames] = useState([]);
  const [leadersByLeague, setLeadersByLeague] = useState({ seniors: [], juniors: [], sophomores: [] });
  const [highlights, setHighlights] = useState([]);

  const [rotateSeconds, setRotateSeconds] = useState(18);
  const [autoRotate, setAutoRotate] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [now, setNow] = useState(Date.now());
  const [highlightIndex, setHighlightIndex] = useState(0);

  const wrapRef = useRef(null);

  async function loadAll() {
    // standings
    const { data: standingsData } = await supabase
      .from("standings")
      .select("*")
      .eq("league_id", league)
      .eq("sport", "overall")
      .order("league_points", { ascending: false });

    setStandings(standingsData || []);

   // camp standings — aggregate points across all leagues per team, INCLUDING non-game points
   const { data: allStandings } = await supabase
  .from("standings")
  .select("team_name, league_points")
  .eq("sport", "overall");

 // Sum league_points per team_name across all leagues
 const totalsMap = {};
 (allStandings || []).forEach((row) => {
  const name = String(row.team_name || "").trim().toLowerCase();
  if (!name) return;
  totalsMap[name] = (totalsMap[name] || 0) + Number(row.league_points || 0);
 });

 // Add non-game points on top, same as the public Standings "Overall" tab
 const { data: ngStandingsData } = await supabase
  .from("non_game_points")
  .select("team_name, points")
  .eq("deleted", false)
  .eq("status", "final")
  .limit(5000);

 (ngStandingsData || []).forEach((row) => {
  const name = String(row.team_name || "").trim().toLowerCase();
  if (!name) return;
  totalsMap[name] = (totalsMap[name] || 0) + Number(row.points || 0);
 });

 const aggregated = Object.entries(totalsMap)
  .map(([team_name, league_points]) => ({ team_name, league_points }))
  .sort((a, b) => b.league_points - a.league_points);

 setCampStandings(aggregated);
    // live games
    const { data: live } = await supabase
      .from("live_games")
      .select("*")
      .eq("status", "active")
      .is("played_on", null)
      .order("updated_at", { ascending: false });

    setLiveGames(live || []);

    // finals
    const { data: finals } = await supabase
      .from("games")
      .select("*")
      .eq("status", "final")
      .eq("deleted", false)
      .order("updated_at", { ascending: false })
      .limit(12);

    setFinalGames(finals || []);

    // leaders — fetch ALL THREE leagues independently. Each league's stat
    // leaders is its own dedicated scene now, so all three need their own
    // data on every load, not just whichever league happens to be selected.
    async function fetchLeadersForLeague(lid) {
      const { data: leaderPool } = await supabase
        .from("player_totals")
        .select("*")
        .eq("league_id", lid)
        .order("value", { ascending: false })
        .limit(500);

      const bestPerCategory = new Map();
      for (const row of leaderPool || []) {
        const key = `${String(row.sport || "").toLowerCase()}:${String(row.stat_key || "").toLowerCase()}`;
        const existing = bestPerCategory.get(key);
        if (!existing || Number(row.value || 0) > Number(existing.value || 0)) {
          bestPerCategory.set(key, row);
        }
      }

      return Array.from(bestPerCategory.values()).sort(
        (a, b) => Number(b.value || 0) - Number(a.value || 0)
      );
    }

    const [seniorsLeaders, juniorsLeaders, sophomoresLeaders] = await Promise.all([
      fetchLeadersForLeague("seniors"),
      fetchLeadersForLeague("juniors"),
      fetchLeadersForLeague("sophomores"),
    ]);

    setLeadersByLeague({
      seniors: seniorsLeaders,
      juniors: juniorsLeaders,
      sophomores: sophomoresLeaders,
    });

    // highlights
    const { data: h } = await supabase
      .from("highlights")
      .select("*")
      .eq("show_on_board", true)
      .order("created_at", { ascending: false });

    setHighlights(h || []);
  }

  useEffect(() => {
    loadAll();
  }, [league]);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const t = setInterval(() => {
      loadAll();
    }, 15000);

    return () => clearInterval(t);
  }, [autoRefresh, league]);

 useEffect(() => {
    if (!autoRotate) return;

    // Pure linear rotation. Each league's stat leaders is now its own
    // hardcoded scene (leaders_seniors, leaders_juniors, leaders_sophomores),
    // so no shared "league" variable needs to be mutated during rotation —
    // each scene is self-contained and always shows the right league.
    const t = setInterval(() => {
      setScene((prevScene) => {
        const idx = SCENES.indexOf(prevScene);
        const safeIdx = idx === -1 ? 0 : idx;
        const nextScene = SCENES[(safeIdx + 1) % SCENES.length];

        if (nextScene === "highlights") {
          setHighlightIndex(0);
        }

        return nextScene;
      });
    }, rotateSeconds * 1000);

    return () => clearInterval(t);
  }, [autoRotate, rotateSeconds]);

 const tickerItems = useMemo(() => {
  const live = liveGames.slice(0, 4).map((g) => {
    const left = g.team_a || g.team_a1 || "Team A";
    const right = g.team_b || g.team_b1 || "Team B";
    const leagueName = fmtLeague(g.league_id || g.league_key);
    return `LIVE: ${leagueName} ${fmtSport(g.sport)} — ${left} ${Number(g.score_a || 0)}-${Number(g.score_b || 0)} ${right}`;
  });

  const finals = finalGames.slice(0, 6).map((g) => {
    const a = Number(g.score_a || 0);
    const b = Number(g.score_b || 0);
    const winner = a > b ? g.team_a : g.team_b;
    const loser = a > b ? g.team_b : g.team_a;
    const bowl = g.is_bowl_game ? `${String(g.bowl_name || "BOWL").toUpperCase()}: ` : "";
    return `FINAL: ${bowl}${winner} defeats ${loser}, ${Math.max(a, b)}-${Math.min(a, b)}`;
  });

  const topStandings = campStandings.slice(0, 3).map((t, i) => {
    return `CAMP STANDINGS: #${i + 1} ${t.team_name} — ${Number(t.league_points || 0)} pts`;
  });

  const allLeaders = [
    ...(leadersByLeague.seniors || []),
    ...(leadersByLeague.juniors || []),
    ...(leadersByLeague.sophomores || []),
  ];

  const topLeaders = allLeaders.slice(0, 4).map((p) => {
    return `LEADER: ${p.player_name} — ${Number(p.value || 0)} ${String(p.stat_key || "").toUpperCase()} (${p.team_name || "—"})`;
  });

  return [...live, ...finals, ...topStandings, ...topLeaders].filter(Boolean);
}, [liveGames, finalGames, campStandings, leadersByLeague]);

  async function goFullscreen() {
    if (!document.fullscreenElement) {
      await wrapRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  /* ===== DATA HELPERS ===== */
    function renderStandings() {
    return (
      <div className="grid h-full grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-950 to-slate-900 p-8 shadow-2xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.3em] text-blue-500">
                Crest League
              </div>
              <div className="text-5xl font-black text-white">
                {fmtLeague(league)} Standings
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/40 bg-blue-500/15 px-6 py-4">
              <div className="text-xs font-bold uppercase tracking-widest text-blue-300">
                LIVE TABLE
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr className="text-left text-lg font-black text-white/70">
                  <th className="px-6 py-5">TEAM</th>
                  <th className="px-6 py-5 text-center">W</th>
                  <th className="px-6 py-5 text-center">L</th>
                  <th className="px-6 py-5 text-center">PTS</th>
                </tr>
              </thead>

              <tbody>
                {standings.map((t, i) => (
                  <tr
                    key={`${t.team_name}-${i}`}
                    className={cx(
                      "border-t border-white/5",
                      i === 0 && "bg-blue-500/10"
                    )}
                  >
                    <td className="px-6 py-6 text-3xl font-black text-white">
                      #{i + 1} {t.team_name}
                    </td>

                    <td className="px-6 py-6 text-center text-3xl font-black text-white">
                      {t.wins}
                    </td>

                    <td className="px-6 py-6 text-center text-3xl font-black text-white/70">
                      {t.losses}
                    </td>

                    <td className="px-6 py-6 text-center text-4xl font-black text-blue-400">
                      {Number(t.league_points || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-blue-950/40 to-slate-900 p-8">
            <div className="text-lg font-black uppercase tracking-widest text-blue-400">
              League Status
            </div>

            <div className="mt-4 text-6xl font-black text-white">
              {liveGames.length}
            </div>

            <div className="mt-2 text-xl font-bold text-white/70">
              Games currently live
            </div>
          </div>

          <div className="flex-1 rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 to-black p-8">
            <div className="mb-6 text-3xl font-black text-white">
              Recent Finals
            </div>

            <div className="space-y-4">
              {finalGames.slice(0, 5).map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="text-sm font-black uppercase tracking-widest text-blue-400">
                    {fmtLeague(g.league_id)} • {fmtSport(g.sport)}
                  </div>

                  <div className="mt-2 text-2xl font-black text-white">
                    {g.team_a} vs {g.team_b}
                  </div>

                  <div className="mt-3 text-5xl font-black text-white">
                    {g.score_a} - {g.score_b}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderLiveGames() {
    if (!liveGames.length) return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-6xl font-black text-white/20">—</div>
          <div className="mt-4 text-2xl font-black uppercase tracking-widest text-white/30">No Games Live Right Now</div>
        </div>
      </div>
    );

    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {liveGames.map((g) => (
          <div
            key={g.id}
            className="rounded-[32px] border border-blue-500/20 bg-gradient-to-br from-blue-950/20 to-slate-950 p-8 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black uppercase tracking-widest text-white">
                LIVE
              </div>

              <div className="text-sm font-bold uppercase tracking-widest text-white/50">
                {fmtLeague(g.league_id)} • {fmtSport(g.sport)}
              </div>
            </div>

            <div className="text-4xl font-black text-white">
              {g.team_a}
            </div>

            <div className="my-4 text-center text-7xl font-black text-blue-400">
              {g.score_a} - {g.score_b}
            </div>

            <div className="text-right text-4xl font-black text-white">
              {g.team_b}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderFinals() {
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {finalGames.map((g) => (
          <div
            key={g.id}
            className="rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 to-black p-8"
          >
            <div className="text-sm font-black uppercase tracking-[0.2em] text-blue-400">
              FINAL
            </div>

            <div className="mt-3 text-lg font-black text-white/60">
              {fmtLeague(g.league_id)} • {fmtSport(g.sport)}
            </div>

            <div className="mt-5 text-3xl font-black text-white">
              {g.team_a}
            </div>

            <div className="my-5 text-center text-6xl font-black text-blue-400">
              {g.score_a} - {g.score_b}
            </div>

            <div className="text-right text-3xl font-black text-white">
              {g.team_b}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderLeaders(leagueKey) {
    const leaders = leadersByLeague[leagueKey] || [];
    return (
      <div className="flex h-full flex-col gap-6">
        <div className="text-sm font-black uppercase tracking-[0.3em] text-blue-400">
          {fmtLeague(leagueKey)} Stat Leaders
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {leaders.slice(0, 9).map((p) => (
          <div
            key={`${String(p.sport || "").toLowerCase()}-${String(p.stat_key || "").toLowerCase()}`}
            className="rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 to-black p-8"
          >
            <div className="text-sm font-black uppercase tracking-[0.2em] text-blue-400">
              STAT LEADER
            </div>

            <div className="mt-4 text-4xl font-black text-white">
              {p.player_name}
            </div>

            <div className="mt-2 text-xl font-bold text-white/60">
              {p.team_name}
            </div>

            <div className="mt-8 flex items-end justify-between">
              <div>
                <div className="text-lg font-black uppercase text-white/50">
                  {p.stat_key}
                </div>

                <div className="text-7xl font-black text-blue-400">
                  {p.value}
                </div>
              </div>

              <div className="text-sm font-black uppercase tracking-widest text-white/40">
                {fmtSport(p.sport)}
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>
    );
  }

 function renderHighlights() {
    if (!highlights.length) return (
      <div className="flex h-full items-center justify-center text-white/40 text-2xl font-black">
        No highlights yet.
      </div>
    );

    const safeIndex = highlightIndex % highlights.length;
    const h = highlights[safeIndex];

    const { data } = supabase.storage
      .from("highlights")
      .getPublicUrl(h.file_path);

    const url = data?.publicUrl;

    function goNext() {
      setHighlightIndex((i) => (i + 1) % highlights.length);
    }

    return (
      <div className="grid grid-cols-1 gap-8 h-full">
        <div className="overflow-hidden rounded-[40px] border border-white/10 bg-black">
          <div className="border-b border-white/10 bg-gradient-to-r from-blue-700 to-blue-500 px-8 py-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.3em] text-white/70">
                FEATURED HIGHLIGHT
              </div>
              <div className="mt-1 text-4xl font-black text-white">
                {h.title || "Camp Highlight"}
              </div>
            </div>
            <div className="text-sm font-black text-white/50">
              {safeIndex + 1} / {highlights.length}
            </div>
          </div>

          <div className="aspect-video bg-black">
            {h.file_type === "video" ? (
              <video
                key={h.id}
                src={url}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-contain"
                onEnded={goNext}
              />
            ) : (
              <img
                key={h.id}
                src={url}
                alt=""
                className="h-full w-full object-contain"
                onLoad={() => setTimeout(goNext, 8000)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ===== MAIN RETURN ===== */
    return (
    <main
      ref={wrapRef}
      className="relative min-h-screen overflow-hidden bg-[#050509] text-white"
    >
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(58,113,255,0.30),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(30,64,175,0.22),transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:48px_48px] opacity-[0.08]" />
      </div>

      {/* Top compact ESPN-style header */}
      <header className="relative z-10 flex h-[72px] items-center justify-between border-b border-white/10 bg-black/65 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 rounded-xl border border-blue-400/30 bg-black/40 px-4 py-2 shadow-[0_0_18px_rgba(58,113,255,0.35)]">
            <span
              className="text-2xl font-black italic tracking-tighter"
              style={{
                color: "#bcd4ff",
                textShadow: "0 0 6px #5b8cff, 0 0 14px #3a71ff, 0 0 22px rgba(58,113,255,0.6)",
              }}
            >
              CBSN
            </span>
          </div>

          <div className="hidden text-sm font-black uppercase tracking-[0.25em] text-white/50 md:block">
            Camp Bauercrest Sports Network
          </div>
        </div>

        <div className="flex items-center gap-3">

          <button
            onClick={loadAll}
            className="h-10 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black hover:bg-white/20"
          >
            Refresh
          </button>

          <button
            onClick={() => setAutoRefresh((x) => !x)}
            className="h-10 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black hover:bg-white/20"
          >
            Auto {autoRefresh ? "On" : "Off"}
          </button>

          <button
            onClick={() => setAutoRotate((x) => !x)}
            className="h-10 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black hover:bg-white/20"
          >
            Rotate {autoRotate ? "On" : "Off"}
          </button>

          <button
            onClick={goFullscreen}
            className="h-10 rounded-xl border border-blue-500/40 bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-500"
          >
            Fullscreen
          </button>

          <div className="hidden h-10 items-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black tabular-nums text-white/80 lg:flex">
            {fmtClock(now)}
          </div>
        </div>
      </header>

      {/* Scene tabs compact row */}
      <section className="relative z-10 flex h-[58px] items-center justify-between border-b border-white/10 bg-[#0b0b10]/80 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {SCENES.map((s) => (
            <button
              key={s}
              onClick={() => setScene(s)}
              className={cx(
                "h-10 rounded-xl px-4 text-sm font-black uppercase tracking-wide transition",
                scene === s
                  ? "bg-white text-black shadow-lg"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {SCENE_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-xs font-black uppercase tracking-[0.25em] text-white/40 md:block">
            Current Scene
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-black uppercase tracking-wide text-blue-300">
            {SCENE_LABELS[scene]}
          </div>

          <select
            value={rotateSeconds}
            onChange={(e) => setRotateSeconds(Number(e.target.value))}
            className="h-10 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-black text-white outline-none"
          >
            <option value={12}>12s</option>
            <option value={18}>18s</option>
            <option value={25}>25s</option>
            <option value={35}>35s</option>
          </select>
        </div>
      </section>

      {/* Main board area */}
      <section className="relative z-10 h-[calc(100vh-72px-58px-52px)] p-6">
        <div className="h-full overflow-hidden">
          {scene === "camp" && (
            <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-950 to-slate-900 p-8 shadow-2xl">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.3em] text-blue-500">
                    Camp-Wide
                  </div>
                  <div className="text-5xl font-black text-white">
                    Overall Camp Standings
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-500/40 bg-blue-500/15 px-6 py-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-blue-300">
                    ALL AGE GROUPS
                  </div>
                </div>
              </div>

              <div className="grid h-[calc(100%-160px)] grid-cols-1 gap-6 xl:grid-cols-2">
                {campStandings.map((t, i) => (
                  <div
                    key={`${t.league_id}-${t.team_name}-${i}`}
                    className={cx(
                      "flex items-center justify-between rounded-[32px] border border-white/10 bg-white/[0.04] p-10",
                      i === 0 && "border-blue-500/40 bg-blue-500/10"
                    )}
                  >
                    <div>
                      <div className="text-lg font-black uppercase tracking-[0.2em] text-white/40">
                        #{i + 1} • ALL LEAGUES
                       </div>
                      <div className="mt-2 text-6xl font-black text-white xl:text-7xl">
                        {t.team_name}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-black uppercase tracking-[0.2em] text-blue-300">
                        POINTS
                      </div>
                      <div className="text-8xl font-black text-blue-400 xl:text-9xl">
                        {Number(t.league_points || 0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scene === "live" && renderLiveGames()}
          {scene === "finals" && renderFinals()}
          {scene === "leaders_seniors" && renderLeaders("seniors")}
          {scene === "leaders_juniors" && renderLeaders("juniors")}
          {scene === "leaders_sophomores" && renderLeaders("sophomores")}
          {scene === "highlights" && renderHighlights()}
        </div>
      </section>

      {/* Bottom ticker */}
      <Ticker items={tickerItems} />

      {/* Error overlay */}
      {false && (
        <div className="absolute right-4 top-24 z-50 rounded-xl border border-blue-500/30 bg-blue-950/90 px-4 py-3 text-sm font-bold text-blue-100">
          Error loading board
        </div>
      )}
    </main>
  );
}

/* ===== BOTTOM COMPONENTS ===== */
function Ticker({ items }) {
  const text = items && items.length ? items.join("     •     ") : "";
  if (!text) return null;
  return (
    <footer className="absolute bottom-0 left-0 right-0 z-20 flex h-[52px] overflow-hidden border-t-2 border-blue-400/60 bg-[#0a1530] shadow-[0_-4px_20px_rgba(58,113,255,0.25)]">
      <div className="flex shrink-0 items-center bg-black px-5">
        <div
          className="text-sm font-black uppercase tracking-[0.25em]"
          style={{ color: "#bcd4ff", textShadow: "0 0 8px #3a71ff" }}
        >
          CBSN Ticker
        </div>
      </div>

      <div className="relative flex flex-1 items-center overflow-hidden">
        <div className="animate-[ticker_55s_linear_infinite] whitespace-nowrap px-8 text-xl font-black uppercase tracking-wide text-white">
          {text}     •     {text}
        </div>
      </div>

      <style jsx>{`
        @keyframes ticker {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </footer>
  );
}