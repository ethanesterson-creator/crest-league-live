"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { useConfirmDialog } from "@/lib/useConfirmDialog";
import { PageHeader, EmptyState, ErrorNote } from "@/components/ui";
const SPORTS = ["Hoop", "Soccer", "Softball", "Kickball", "Volleyball", "Football", "Speedball", "Euro", "Hockey", "Newcomb"];
const FALLBACK_LEVELS = ["A", "B", "C", "D", "E", "F"];
const MODES = ["5v5", "6v6", "7v7", "8v8", "9v9", "10v10", "11v11"];

// Fixed reasons (kept in sync with non_game_point_reasons view in Supabase)
const NON_GAME_REASONS = [
  "Pickleball",
  "Frisbee",
  "Bombardment",
  "Spirit",
  "Other",
];

const CW_NON_GAME_REASONS = [
  "Tugs",
  "Cleanliness",
  "Lateness",
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
  const { season, session, isCW, blueName, whiteName } = useAppMode();
  const [err, setErr] = useNotifyingErr();
  const { confirmAsync, confirmModal } = useConfirmDialog();
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

  // Crest Cup only ever uses Soccer — lock it automatically, generic mode label
  useEffect(() => {
    if (matchupType === "crest_cup") {
      setSport("Soccer");
      setMode("Crest Cup");
      setModeDirty(true);
    }
  }, [matchupType]);

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

  async function loadTeams(lk, isCrestCup = false) {
    // Color War: teams are always Blue and White.
    if (isCW) {
      setTeams(["blue", "white"]);
      setTeamA((prev) => (prev === "blue" || prev === "white" ? prev : "blue"));
      setTeamB((prev) => (prev === "blue" || prev === "white" ? prev : "white"));
      return;
    }
    const query = isCrestCup
      ? supabase.from("players").select("team_name").eq("departed", false).limit(5000)
      : supabase.from("players").select("team_name").eq("league_id", lk).eq("departed", false).limit(5000);
    const { data, error } = await query;

    if (error) {
      // Used to just clear the list with no indication anything failed --
      // a counselor on flaky camp WiFi would see empty Team A/B pickers and
      // no way to tell it was a fetch error vs. a league with no teams.
      setTeams([]);
      setErr(`Couldn't load teams: ${error.message}`);
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
      .eq("departed", false)
      .limit(5000);

    if (error) {
      setNgAllTeams([]);
      setErr(`Couldn't load teams: ${error.message}`);
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

  async function deleteDraft(id, label) {
    const ok = await confirmAsync(`${label}\n\nThis cannot be undone.`, { title: "Delete this draft?", confirmLabel: "Delete" });
    if (!ok) return;
    try {
      // Remove child rows first, then the game. If a child delete fails we
      // stop here instead of deleting the parent anyway -- otherwise those
      // rows are orphaned, silently pointing at a game_id that no longer
      // exists, with a false "deleted" success message on top.
      const { error: evErr } = await supabase.from("live_events").delete().eq("game_id", id);
      if (evErr) { setErr(`Couldn't delete draft: ${evErr.message}`); return; }

      const { error: rosterErr } = await supabase.from("game_roster").delete().eq("game_id", id);
      if (rosterErr) { setErr(`Couldn't delete draft: ${rosterErr.message}`); return; }

      const { error } = await supabase.from("live_games").delete().eq("id", id);
      if (error) { setErr(error.message); return; }
      setMsg("🗑️ Draft deleted.");
      await loadDrafts();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function loadDrafts() {
    const { data, error } = await supabase
      .from("live_games")
      .select("id, created_at, played_on, league_key, sport, level, mode, matchup_type, team_a1, team_a2, team_b1, team_b2, score_a, score_b, status, is_staff_game")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) { setErr(`Couldn't load drafts: ${error.message}`); return; }
    setDrafts(data || []);
  }

  // league changes -> reload teams
  useEffect(() => {
    loadTeams(norm(leagueKey), matchupType === "crest_cup");
  }, [leagueKey, matchupType, isCW]);

  // league/sport changes -> reload level options, reset override
  useEffect(() => {
    loadAvailableLevels();
    setModeDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueKey, sport]);

  // Keep level in sync with whatever levels actually exist for this league+sport.
  useEffect(() => {
    if (String(level).toUpperCase() === "ALL") {
      setLevel(availableLevels?.length ? availableLevels[0] : "A");
    } else if (availableLevels?.length && !availableLevels.includes(String(level).toUpperCase())) {
      setLevel(availableLevels[0]);
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
    if (matchupType === "full_team") return "";
    if (matchupType === "crest_cup") return "";

    const a2 = norm(teamA2);
    const b2 = norm(teamB2);
    if (!a2 || !b2) return "Pick all 4 teams (A1, A2, B1, B2).";

    const picks = [a1, a2, b1, b2];
    const uniq = new Set(picks);
    if (uniq.size !== picks.length) return "All 4 teams must be different (no duplicates).";

    return "";
  }

  async function createDraft() {
    setErr("");
    setMsg("");

    try {
      const lk = norm(leagueKey);
      const lv = String(level || "").trim().toUpperCase();

      if (!playedOn) throw new Error("Pick a date.");
      if (matchupType !== "crest_cup" && !lk) throw new Error("Pick a league.");

      const teamErr = validateTeams();
      if (teamErr) throw new Error(teamErr);

      const finalLevel = matchupType === "full_team" ? "FULL" : matchupType === "crest_cup" ? "A" : lv;

      if (matchupType === "two_team" && finalLevel === "FULL") {
        throw new Error("FULL level is only for Full Team matchups. Pick A, B, C, or D for a 2v2 team game.");
      }
      const finalLeagueKey = matchupType === "crest_cup" ? "crest_cup" : lk;

      // Same hard safety net as the live Create Game form — never create a
      // draft with a level that has no matching points_rules row.
      if (finalLeagueKey !== "crest_cup") {
        const { data: ruleCheck, error: ruleCheckErr } = await supabase
          .from("points_rules")
          .select("win_points")
          .eq("league_id", finalLeagueKey)
          .eq("sport", norm(sport))
          .eq("level", finalLevel)
          .maybeSingle();

        if (ruleCheckErr) throw new Error(`Could not verify points rules: ${ruleCheckErr.message}`);
        if (!ruleCheck) throw new Error(`No points rules exist for ${finalLeagueKey} / ${sport} / level ${finalLevel}. Pick a different level or sport.`);
      }

      const row = {
        status: "draft",
        played_on: playedOn,

        league_key: finalLeagueKey,
        sport,
        level: finalLevel,
        mode,

       matchup_type: isCW ? "single" : matchupType,
        team_a1: norm(teamA),
        team_b1: norm(teamB),
        team_a2: (!isCW && matchupType === "two_team") ? norm(teamA2) : null,
        team_b2: (!isCW && matchupType === "two_team") ? norm(teamB2) : null,

        score_a: 0,
        score_b: 0,

        is_staff_game: false,
        season,
        session,
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
        season,
        session,
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
    <div className="pb-10">
      {confirmModal}
      <div>
        <PageHeader title="Add results" description="Enter results after the fact: post a finished game, or add non-game points.">
          <Link href="/" className="btn btn-secondary btn-sm">Home</Link>
        </PageHeader>

        {err ? <div className="mt-4"><ErrorNote>{err}</ErrorNote></div> : null}

        {msg ? (
          <div role="status" className="mt-4 rounded-md border-[1.5px] border-[var(--good)] p-3 text-sm font-semibold text-[var(--good-ink)]">{msg}</div>
        ) : null}

        {/* Entry Type Switch */}
        <section className="bc-card bc-card-pad mt-6" aria-labelledby="entry-type-h">
          <div className="bc-section-head"><h2 id="entry-type-h">What are you adding?</h2></div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {[
              { key: "post", title: "Finished game", desc: "Create a draft, enter score and stats, then finalize." },
              { key: "non_game", title: "Non-game points", desc: "Spirit, cheering, and the like. One team per entry." },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={entryType === o.key}
                onClick={() => setEntryType(o.key)}
                className="min-h-[72px] rounded-md border-[1.5px] px-4 py-3 text-left"
                style={entryType === o.key
                  ? { background: "var(--ink)", borderColor: "var(--ink)", color: "var(--on-ink)" }
                  : { background: "transparent", borderColor: "var(--ink-3)", color: "var(--ink)" }}
              >
                <div className="text-lg font-bold">{o.title}</div>
                <div className="text-sm" style={{ opacity: 0.85 }}>{o.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* GAMES FORM (post + staff) */}
        {entryType === "post" ? (
          <div className="bc-card bc-card-pad mt-6">
            <div className="bc-section-head"><h2>Create Past Game Draft</h2></div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="bc-select-label">Date</span>
                <input
                  type="date"
                  className="bc-select"
                  value={playedOn}
                  onChange={(e) => setPlayedOn(e.target.value)}
                />
              </label>

              {matchupType !== "crest_cup" ? (
                <label className="text-sm">
                  <span className="bc-select-label">League</span>
                  <select
                    className="bc-select"
                    value={leagueKey}
                    onChange={(e) => setLeagueKey(e.target.value)}
                  >
                    <option value="sophomores">Sophomores</option>
                    <option value="juniors">Juniors</option>
                    <option value="seniors">Seniors</option>
                  </select>
                </label>
              ) : (
                <div className="text-xs text-slate-400 flex items-end pb-2">Crest Cup — spans all leagues, no age group split.</div>
              )}

              <label className="text-sm">
                <span className="bc-select-label">Sport</span>
                <select
                  className="bc-select disabled:opacity-50"
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

              {/* Matchup type */}
              <label className="text-sm">
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

              {matchupType !== "full_team" && matchupType !== "crest_cup" ? (
                <label className="text-sm">
                  <span className="bc-select-label">Level</span>
                  <select
                    className="bc-select"
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
                  <span className="bc-select-label">Mode</span>
                  <select
                    className="bc-select"
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

              <div />

              {isCW ? (
                <div className="sm:col-span-2 rounded-md border-[1.5px] border-[var(--ink)] p-4 text-center">
                  <div className="bc-display text-3xl leading-none">{blueName} <span className="text-[var(--ink-3)]">vs</span> {whiteName}</div>
                  <div className="mt-2 text-sm text-[var(--ink-2)]">Teams are set automatically for Color War.</div>
                </div>
              ) : (
              <>
              <label className="text-sm">
                <span className="bc-select-label">Team A1</span>
                <select
                  className="bc-select"
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
                <span className="bc-select-label">Team B1</span>
                <select
                  className="bc-select"
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
              </>
              )}

              {!isCW && matchupType === "two_team" ? (
                <>
                  <label className="text-sm">
                    <span className="bc-select-label">Team A2</span>
                    <select
                      className="bc-select"
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
                    <span className="bc-select-label">Team B2</span>
                    <select
                      className="bc-select"
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
              onClick={() => createDraft()}
              className="btn mt-5 w-full" style={{ minHeight: 56, fontSize: 18 }}
            >
              Create Draft
            </button>

            <div className="mt-3 text-xs text-white/60">
              Drafts open in the same editor page. Staff drafts are labeled and will later feed the Staff standings tab.
            </div>
          </div>
        ) : null}

        {/* NON-GAME POINTS FORM */}
        {entryType === "non_game" ? (
          <div className="bc-card bc-card-pad mt-6">
            <div className="bc-section-head"><h2>Add Non-Game Points</h2></div>
            <div className="mt-1 text-sm text-white/70">Single team per entry. Use multiple entries for multiple teams.</div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="bc-select-label">Date</span>
                <input
                  type="date"
                  className="bc-select"
                  value={ngDate}
                  onChange={(e) => setNgDate(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="bc-select-label">League (context)</span>
                <select
                  className="bc-select"
                  value={ngLeagueKey}
                  onChange={(e) => setNgLeagueKey(e.target.value)}
                >
                  <option value="sophomores">Sophomores</option>
                  <option value="juniors">Juniors</option>
                  <option value="seniors">Seniors</option>
                </select>
              </label>

              <label className="text-sm">
                <span className="bc-select-label">Team</span>
                <select
                  className="bc-select"
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
                <span className="bc-select-label">Points</span>
                <input
                  type="number"
                  min="0"
                  className="bc-select"
                  value={ngPoints}
                  onChange={(e) => setNgPoints(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="bc-select-label">Reason</span>
                <select
                  className="bc-select"
                  value={ngReason}
                  onChange={(e) => setNgReason(e.target.value)}
                >
                  {(isCW ? CW_NON_GAME_REASONS : NON_GAME_REASONS).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              {ngReason === "Other" ? (
                <label className="text-sm">
                  <span className="bc-select-label">Other (type it)</span>
                  <input
                    type="text"
                    className="bc-select"
                    value={ngOther}
                    onChange={(e) => setNgOther(e.target.value)}
                    placeholder="Example: Best banner"
                  />
                </label>
              ) : (
                <div />
              )}

              <label className="text-sm md:col-span-2">
                <span className="bc-select-label">Notes (optional)</span>
                <input
                  type="text"
                  className="bc-select"
                  value={ngNotes}
                  onChange={(e) => setNgNotes(e.target.value)}
                  placeholder="Example: Loudest section during finals"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                onClick={() => submitNonGamePoints({ asDraft: true })}
                className="btn btn-secondary w-full"
              >
                Save as Draft
              </button>
              <button
                onClick={() => submitNonGamePoints({ asDraft: false })}
                className="btn w-full"
              >
                Add Points
              </button>
            </div>
          </div>
        ) : null}

        {/* Draft list */}
        <div className="bc-card bc-card-pad mt-8">
          <div className="flex items-center justify-between gap-3">
            <div className="bc-section-head"><h2>Draft Games</h2></div>
            <button
              onClick={() => loadDrafts()}
              className="btn btn-secondary btn-sm"
            >
              Refresh
            </button>
          </div>

          {!filteredDrafts.length ? (
            <div className="mt-4"><EmptyState title="No drafts yet">Create one above and it will wait here until you finalize it.</EmptyState></div>
          ) : (
            <div className="rule-list mt-2">
              {filteredDrafts.map((g) => {
                const left =
                  g.matchup_type === "two_team" ? matchupLabel(g.team_a1, g.team_a2) : norm(g.team_a1);
                const right =
                  g.matchup_type === "two_team" ? matchupLabel(g.team_b1, g.team_b2) : norm(g.team_b1);

                return (
                  <div
                    key={g.id}
                    className="relative py-4"
                  >
                    <Link href={`/post/${g.id}`} className="block hover:opacity-90">
                      <div className="flex items-center justify-between gap-3 pr-20">
                        <div className="text-xs text-white/60">{g.played_on ?? "—"}</div>
                      </div>
                      <div className="mt-1 text-xl font-bold pr-20">
                        {left} vs {right}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        {g.league_key} • {g.sport} • Level {g.level} • {g.mode} •{" "}
                        <span className="bc-chip" style={{ color: "var(--warn-ink)" }}>draft</span>
                      </div>
                      <div className="bc-num mt-2 text-4xl leading-none">
                        {Number(g.score_a || 0)}–{Number(g.score_b || 0)}
                      </div>
                    </Link>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteDraft(g.id, `${left} vs ${right}`); }}
                      className="btn btn-danger btn-sm absolute right-3 top-3"
                    >
                      Delete
                    </button>
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