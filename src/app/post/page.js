"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const SPORTS = ["Hoop", "Soccer", "Softball", "Volleyball", "Football", "Speedball", "Euro", "Hockey", "Evening Activity"];
const FALLBACK_LEVELS = ["A", "B", "C", "D", "ALL"];
const MODES = ["5v5", "6v6", "7v7", "8v8", "9v9", "10v10", "11v11"];

// Fixed reasons (based on proposal themes + Other)
const NON_GAME_REASONS = [
  "Spirit",
  "Cheering / Loudest Section",
  "Sportsmanship",
  "Friday Night Songs",
  "Community / Bunk Pride",
  "Neb Events",
  "Other",
];

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function matchupLabel(a1, a2) {
  const x1 = norm(a1);
  const x2 = norm(a2);
  if (x1 && x2 && x1 !== x2) return `${x1} + ${x2}`;
  return x1 || "—";
}

export default function PostGamesPage() {
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Entry type for Phase 2
  // post = camper post game (draft -> /post/[id])
  // staff = staff game (draft -> /post/[id] but tagged)
  // non_game = points entry
  const [entryType, setEntryType] = useState("post");

  // Shared selectors (games)
  const [leagueKey, setLeagueKey] = useState("seniors");
  const [sport, setSport] = useState("Hoop");

  const [availableLevels, setAvailableLevels] = useState(FALLBACK_LEVELS);
  const [level, setLevel] = useState("A");

  const [mode, setMode] = useState("5v5");
  const [modeDirty, setModeDirty] = useState(false);

  // matchup type
  const [matchupType, setMatchupType] = useState("single"); // single | two_team

  const [teams, setTeams] = useState([]);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [teamA2, setTeamA2] = useState("");
  const [teamB2, setTeamB2] = useState("");

  const [playedOn, setPlayedOn] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  // drafts list (post + staff)
  const [drafts, setDrafts] = useState([]);

  // Non-game points form
  const [ngLeagueKey, setNgLeagueKey] = useState("seniors"); // context only
  const [ngTeam, setNgTeam] = useState("");
  const [ngPoints, setNgPoints] = useState("10");
  const [ngReason, setNgReason] = useState(NON_GAME_REASONS[0]);
  const [ngOther, setNgOther] = useState("");
  const [ngNotes, setNgNotes] = useState("");
  const [ngDate, setNgDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ngAllTeams, setNgAllTeams] = useState([]);

  async function fetchRuleRow(lk, sp, lv) {
    const league_id = norm(lk);
    const sport_key = norm(sp);
    const level_key = String(lv || "").trim().toUpperCase();
    if (!league_id || !sport_key || !level_key) return null;

    const { data, error } = await supabase
      .from("points_rules")
      .select("default_mode, level")
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

    const { data, error } = await supabase
      .from("points_rules")
      .select("level")
      .eq("league_id", league_id)
      .eq("sport", sport_key);

    if (error) {
      setAvailableLevels(FALLBACK_LEVELS);
      return;
    }

    const uniq = Array.from(
      new Set((data || []).map((r) => String(r.level || "").trim().toUpperCase()).filter(Boolean))
    );

    const order = { A: 1, B: 2, C: 3, D: 4, ALL: 99 };
    uniq.sort((a, b) => (order[a] ?? 50) - (order[b] ?? 50));

    setAvailableLevels(uniq.length ? uniq : FALLBACK_LEVELS);
  }

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
      setTeamB((prev) => (norm(prev) ? prev : list[1] ?? list[0]));
      setTeamA2((prev) => (norm(prev) ? prev : list[2] ?? list[0]));
      setTeamB2((prev) => (norm(prev) ? prev : list[3] ?? list[1] ?? list[0]));
    } else {
      setTeamA("");
      setTeamB("");
      setTeamA2("");
      setTeamB2("");
    }
  }

  // For non-game points: team list across camp (same 4 names across leagues)
  async function loadAllTeams() {
    const { data, error } = await supabase
      .from("players")
      .select("team_name")
      .limit(5000);

    if (error) {
      setNgAllTeams([]);
      return;
    }

    const uniq = new Set();
    for (const p of data || []) {
      const t = norm(p.team_name);
      if (t) uniq.add(t);
    }

    const list = Array.from(uniq).sort((a, b) => a.localeCompare(b));
    setNgAllTeams(list);
    if (list.length) setNgTeam((prev) => (norm(prev) ? prev : list[0]));
  }

  async function loadDrafts() {
    const { data, error } = await supabase
      .from("live_games")
      .select("id, created_at, played_on, league_key, sport, level, mode, matchup_type, team_a1, team_a2, team_b1, team_b2, score_a, score_b, status, is_staff_game")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error) setDrafts(data || []);
  }

  // league changes -> reload teams
  useEffect(() => {
    loadTeams(norm(leagueKey));
  }, [leagueKey]);

  // league/sport changes -> reload level options, reset override
  useEffect(() => {
    loadAvailableLevels();
    setModeDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueKey, sport]);

  // sport = Evening Activity forces level ALL
  useEffect(() => {
    if (norm(sport) === "evening activity") {
      setLevel("ALL");
    } else {
      if (availableLevels?.length && !availableLevels.includes(String(level).toUpperCase())) {
        setLevel(availableLevels[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, availableLevels]);

  // apply mode default from points_rules when selection changes
  useEffect(() => {
    (async () => {
      const lv = String(level || "").trim().toUpperCase();
      if (!lv) return;

      const row = await fetchRuleRow(leagueKey, sport, lv);
      if (!row) return;

      if (!modeDirty && row.default_mode) setMode(row.default_mode);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueKey, sport, level]);

  useEffect(() => {
    loadDrafts();
    loadAllTeams();
  }, []);

  function validateTeams() {
    const a1 = norm(teamA);
    const b1 = norm(teamB);
    if (!a1 || !b1) return "Pick both teams.";
    if (a1 === b1) return "Teams must be different.";

    if (matchupType === "single") return "";

    const a2 = norm(teamA2);
    const b2 = norm(teamB2);
    if (!a2 || !b2) return "Pick all 4 teams (A1, A2, B1, B2).";

    const picks = [a1, a2, b1, b2];
    const uniq = new Set(picks);
    if (uniq.size !== picks.length) return "All 4 teams must be different (no duplicates).";

    return "";
  }

  async function createDraft({ staff = false } = {}) {
    setErr("");
    setMsg("");

    try {
      const lk = norm(leagueKey);
      const lv = String(level || "").trim().toUpperCase();

      if (!playedOn) throw new Error("Pick a date.");
      if (!lk) throw new Error("Pick a league.");

      const teamErr = validateTeams();
      if (teamErr) throw new Error(teamErr);

      const row = {
        status: "draft",
        played_on: playedOn,

        league_key: lk,
        sport,
        level: lv,
        mode,

        matchup_type: matchupType,
        team_a1: norm(teamA),
        team_b1: norm(teamB),
        team_a2: matchupType === "two_team" ? norm(teamA2) : null,
        team_b2: matchupType === "two_team" ? norm(teamB2) : null,

        score_a: 0,
        score_b: 0,

        // Phase 2: staff game tagging (requires column on live_games; if missing you'll see an error)
        is_staff_game: !!staff,
      };

      const { data, error } = await supabase.from("live_games").insert([row]).select("id").single();
      if (error) throw error;

      setMsg(staff ? "✅ Staff game draft created." : "✅ Draft created.");
      await loadDrafts();
      window.location.href = `/post/${data.id}`;
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function submitNonGamePoints({ asDraft = false } = {}) {
    setErr("");
    setMsg("");

    try {
      const t = norm(ngTeam);
      if (!ngDate) throw new Error("Pick a date.");
      if (!t) throw new Error("Pick a team.");
      const pts = Math.floor(Number(ngPoints));
      if (!Number.isFinite(pts) || pts < 0) throw new Error("Points must be a number 0 or higher.");

      let reason = String(ngReason || "").trim();
      if (!reason) throw new Error("Pick a reason.");
      if (reason === "Other") {
        const o = String(ngOther || "").trim();
        if (!o) throw new Error("If reason is Other, type what it is.");
        reason = `Other: ${o}`;
      }

      const row = {
        entry_date: ngDate,
        league_id: norm(ngLeagueKey), // context only
        team_name: t,
        points: pts,
        reason,
        notes: String(ngNotes || "").trim() || null,
        status: asDraft ? "draft" : "final",
        deleted: false,
      };

      const { error } = await supabase.from("non_game_points").insert([row]);
      if (error) throw error;

      setMsg(asDraft ? "✅ Non-game points saved as draft." : "✅ Non-game points added.");
      setNgNotes("");
      setNgOther("");
      setNgPoints("10");
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  const filteredDrafts = drafts.filter((d) => {
    // Show both camper + staff drafts here; label them
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight">Add Results</div>
            <div className="mt-1 text-sm text-white/70">
              Enter results after the fact: <b>Post Games</b>, <b>Staff Games</b>, and <b>Non-Game Points</b>.
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
          <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div>
        ) : null}

        {msg ? (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{msg}</div>
        ) : null}

        {/* Entry Type Switch */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-lg font-black">What are you adding?</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <button
              onClick={() => setEntryType("post")}
              className={`rounded-xl border px-4 py-3 text-left ${
                entryType === "post"
                  ? "border-emerald-400/30 bg-emerald-500/10"
                  : "border-white/10 bg-black/20 hover:bg-black/30"
              }`}
            >
              <div className="font-black">Camper Post Game</div>
              <div className="text-xs text-white/60">Create draft → enter score/stats → finalize</div>
            </button>

            <button
              onClick={() => setEntryType("staff")}
              className={`rounded-xl border px-4 py-3 text-left ${
                entryType === "staff"
                  ? "border-emerald-400/30 bg-emerald-500/10"
                  : "border-white/10 bg-black/20 hover:bg-black/30"
              }`}
            >
              <div className="font-black">Staff Game</div>
              <div className="text-xs text-white/60">Same as post game, but tagged as staff</div>
            </button>

            <button
              onClick={() => setEntryType("non_game")}
              className={`rounded-xl border px-4 py-3 text-left ${
                entryType === "non_game"
                  ? "border-emerald-400/30 bg-emerald-500/10"
                  : "border-white/10 bg-black/20 hover:bg-black/30"
              }`}
            >
              <div className="font-black">Non-Game Points</div>
              <div className="text-xs text-white/60">Spirit/cheering/etc. (single team per entry)</div>
            </button>
          </div>
        </div>

        {/* GAMES FORM (post + staff) */}
        {entryType === "post" || entryType === "staff" ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-black">
              {entryType === "staff" ? "Create Staff Game Draft" : "Create Past Game Draft"}
            </div>

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

              {/* Matchup type */}
              <label className="text-sm">
                <div className="mb-1 text-slate-300">Matchup</div>
                <select
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={matchupType}
                  onChange={(e) => setMatchupType(e.target.value)}
                >
                  <option value="single">1 team vs 1 team</option>
                  <option value="two_team">2 teams vs 2 teams</option>
                </select>
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-300">Level</div>
                <select
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={String(level).toUpperCase()}
                  onChange={(e) => setLevel(e.target.value)}
                  disabled={norm(sport) === "evening activity"}
                >
                  {(availableLevels?.length ? availableLevels : FALLBACK_LEVELS).map((l) => (
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

              <div />

              <label className="text-sm">
                <div className="mb-1 text-slate-300">Team A1</div>
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
                <div className="mb-1 text-slate-300">Team B1</div>
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

              {matchupType === "two_team" ? (
                <>
                  <label className="text-sm">
                    <div className="mb-1 text-slate-300">Team A2</div>
                    <select
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                      value={teamA2}
                      onChange={(e) => setTeamA2(e.target.value)}
                    >
                      {teams.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-slate-300">Team B2</div>
                    <select
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                      value={teamB2}
                      onChange={(e) => setTeamB2(e.target.value)}
                    >
                      {teams.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>

            <button
              onClick={() => createDraft({ staff: entryType === "staff" })}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-emerald-400"
            >
              {entryType === "staff" ? "Create Staff Draft" : "Create Draft"}
            </button>

            <div className="mt-3 text-xs text-white/60">
              Drafts open in the same editor page. Staff drafts are labeled and will later feed the Staff standings tab.
            </div>
          </div>
        ) : null}

        {/* NON-GAME POINTS FORM */}
        {entryType === "non_game" ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-black">Add Non-Game Points</div>
            <div className="mt-1 text-sm text-white/70">Single team per entry. Use multiple entries for multiple teams.</div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <div className="mb-1 text-slate-300">Date</div>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={ngDate}
                  onChange={(e) => setNgDate(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-300">League (context)</div>
                <select
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={ngLeagueKey}
                  onChange={(e) => setNgLeagueKey(e.target.value)}
                >
                  <option value="sophomores">Sophomores</option>
                  <option value="juniors">Juniors</option>
                  <option value="seniors">Seniors</option>
                </select>
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-300">Team</div>
                <select
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={ngTeam}
                  onChange={(e) => setNgTeam(e.target.value)}
                >
                  {(ngAllTeams?.length ? ngAllTeams : teams).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-300">Points</div>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={ngPoints}
                  onChange={(e) => setNgPoints(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-300">Reason</div>
                <select
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={ngReason}
                  onChange={(e) => setNgReason(e.target.value)}
                >
                  {NON_GAME_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              {ngReason === "Other" ? (
                <label className="text-sm">
                  <div className="mb-1 text-slate-300">Other (type it)</div>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                    value={ngOther}
                    onChange={(e) => setNgOther(e.target.value)}
                    placeholder="Example: Best banner"
                  />
                </label>
              ) : (
                <div />
              )}

              <label className="text-sm md:col-span-2">
                <div className="mb-1 text-slate-300">Notes (optional)</div>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 outline-none focus:border-slate-500"
                  value={ngNotes}
                  onChange={(e) => setNgNotes(e.target.value)}
                  placeholder="Example: Loudest section during finals"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                onClick={() => submitNonGamePoints({ asDraft: true })}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-extrabold hover:bg-white/10"
              >
                Save as Draft
              </button>
              <button
                onClick={() => submitNonGamePoints({ asDraft: false })}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-emerald-400"
              >
                Add Points
              </button>
            </div>
          </div>
        ) : null}

        {/* Draft list */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-black">Draft Games</div>
            <button
              onClick={() => loadDrafts()}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Refresh
            </button>
          </div>

          {!filteredDrafts.length ? (
            <div className="mt-4 text-sm text-white/60">No drafts yet.</div>
          ) : (
            <div className="mt-4 grid gap-4">
              {filteredDrafts.map((g) => {
                const left =
                  g.matchup_type === "two_team" ? matchupLabel(g.team_a1, g.team_a2) : norm(g.team_a1);
                const right =
                  g.matchup_type === "two_team" ? matchupLabel(g.team_b1, g.team_b2) : norm(g.team_b1);

                return (
                  <Link
                    key={g.id}
                    href={`/post/${g.id}`}
                    className="block rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-white/60">{g.played_on ?? "—"}</div>
                      {g.is_staff_game ? (
                        <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-1 text-[11px] font-black text-purple-100">
                          STAFF
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xl font-black">
                      {left} vs {right}
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {g.league_key} • {g.sport} • Level {g.level} • {g.mode} •{" "}
                      <span className="text-yellow-300 font-bold">draft</span>
                    </div>
                    <div className="mt-2 text-2xl font-black tabular-nums">
                      {Number(g.score_a || 0)} - {Number(g.score_b || 0)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
