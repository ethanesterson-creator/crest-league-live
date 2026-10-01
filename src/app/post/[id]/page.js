"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { notifyGameFinalized } from "@/lib/notifyGame";
import { useConfirmDialog } from "@/lib/useConfirmDialog";

import { PageHeader, EmptyState, ErrorNote, SkeletonRows } from "@/components/ui";
function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function matchupLabel(a1, a2) {
  const x1 = norm(a1);
  const x2 = norm(a2);
  if (x1 && x2 && x1 !== x2) return `${x1} + ${x2}`;
  return x1 || "—";
}

function getStatKeysForSport(sport) {
  const s = String(sport ?? "").toLowerCase();
  // Matches the live scoring page exactly — no phantom stat categories.
  if (s === "hoop") return ["PTS", "F"];
  if (s === "soccer") return ["G", "A"];
  if (s === "speedball") return ["G", "A"];
  if (s === "euro") return ["G", "A"];
  if (s === "hockey") return ["G", "A"];
  if (s === "softball") return ["H", "HR"];
  if (s === "football") return ["TD"];
  return [];
}

// Full-word captions for stat abbreviations — display only. Same lookup as
// the live scoring page, so a counselor filling this in after the fact
// isn't left guessing what "F" or "TD" means.
const STAT_CAPTIONS = {
  PTS: "Points", F: "Fouls", G: "Goals", A: "Assists",
  H: "Hits", HR: "Home Runs", TD: "Touchdowns",
};
function statCaption(key) {
  return STAT_CAPTIONS[key] || key;
}

function uniqNonEmpty(arr) {
  return Array.from(new Set((arr || []).map((x) => norm(x)).filter(Boolean)));
}

const isBattingSport = (s) => {
  const v = String(s || "").toLowerCase().trim();
  return v === "softball" || v === "kickball";
};

// Captains are season-long: stored on players.role (not per-game)
async function fetchCaptainIds({ leagueId, teamNames }) {
  if (!leagueId || !teamNames?.length) return new Set();

  const { data, error } = await supabase
    .from("players")
    .select("id, role, team_name")
    .eq("league_id", leagueId)
    .in("team_name", teamNames);

  if (error) throw error;

  const capIds = new Set();
  for (const p of data || []) {
    const role = String(p.role || "").toLowerCase();
    if (role.includes("captain")) capIds.add(String(p.id));
  }
  return capIds;
}

export default function PostDraftEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [err, setErr] = useNotifyingErr();
  const { confirmAsync, confirmModal } = useConfirmDialog();
  const [msg, setMsg] = useState("");
  const [game, setGame] = useState(null);

  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);

  const [statTotals, setStatTotals] = useState({});

  const statKeys = useMemo(() => getStatKeysForSport(game?.sport), [game?.sport]);
  const showBatting = useMemo(() => isBattingSport(game?.sport), [game?.sport]);

  const [scoreAInput, setScoreAInput] = useState("0");
  const [scoreBInput, setScoreBInput] = useState("0");

  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Captains (season-long)
  const [captainIds, setCaptainIds] = useState(new Set());

  // Trailing-debounced reload after stat taps: a burst of quick taps used to
  // each trigger their own full `load()`, and whichever one resolved LAST
  // won -- an in-flight reload from an earlier tap could resolve after a
  // newer tap's optimistic update and silently stomp it back out. Same fix
  // already used on the live scoring page: one reload, 800ms after the
  // burst ends, instead of one per tap.
  const reloadTimer = useRef(null);
  function scheduleReload() {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 800);
  }
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  function getTotal(playerId, statKey) {
    const pid = String(playerId ?? "");
    const key = String(statKey ?? "").toUpperCase();
    return Number(statTotals?.[pid]?.[key] ?? 0);
  }

  // Guard against a double-tap firing two overlapping swaps against the same
  // stale roster snapshot (same fix already applied to live/[id]/page.js's
  // moveInOrder, for the same reason: the DB writes below aren't atomic, so
  // overlapping calls can interleave and corrupt sort_order).
  const singleShotRef = useRef(false);
  function singleShot(fn) {
    return async (...args) => {
      if (singleShotRef.current) return;
      singleShotRef.current = true;
      setTimeout(() => { singleShotRef.current = false; }, 300);
      await fn(...args);
    };
  }

  const moveInOrder = singleShot(async (player, dir) => {
    // Batting order only for softball/kickball
    if (!showBatting) return;

    setErr("");
    const side = player.team_side;
    const list = side === "A" ? rosterA : rosterB;
    const idx = list.findIndex((p) => p.player_id === player.player_id);
    if (idx < 0) return;
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= list.length) return;

    const a = list[idx];
    const b = list[j];

    const { error: e1 } = await supabase
      .from("game_roster")
      .update({ sort_order: b.sort_order })
      .eq("game_id", id)
      .eq("player_id", a.player_id);
    if (e1) {
      setErr(e1.message);
      return;
    }

    const { error: e2 } = await supabase
      .from("game_roster")
      .update({ sort_order: a.sort_order })
      .eq("game_id", id)
      .eq("player_id", b.player_id);
    if (e2) {
      // a's row already moved to b's old sort_order but b's row didn't move
      // off it -- both would now share a sort_order in the DB. Roll a back
      // so at least the DB stays internally consistent even though the
      // swap didn't go through.
      const { error: rollbackErr } = await supabase
        .from("game_roster")
        .update({ sort_order: a.sort_order })
        .eq("game_id", id)
        .eq("player_id", a.player_id);
      setErr(rollbackErr ? `Batting order may be out of sync — refresh before continuing. (${e2.message})` : e2.message);
      return;
    }

    const next = [...list];
    next[idx] = { ...a, sort_order: b.sort_order };
    next[j] = { ...b, sort_order: a.sort_order };
    next.sort((x, y) => Number(x.sort_order || 0) - Number(y.sort_order || 0));
    if (side === "A") setRosterA(next);
    else setRosterB(next);
  });

  async function load() {
    setErr("");
    setMsg("");

    // Game, roster, and stat events all only need `id`, not each other's
    // result, so they run together instead of one-after-another -- this
    // reruns after every stat tap during live post-game entry (same fix
    // already applied to past-games/[id] and player/[id]).
    const [
      { data: g, error: gErr },
      { data: r0, error: rErr },
      { data: ev, error: evErr },
    ] = await Promise.all([
      // This editor has no login -- only fetch fields actually rendered
      // below (previously select("*"), same overfetch bug already fixed on
      // the home page in 10ac85a).
      supabase
        .from("live_games")
        .select("score_a, score_b, league_key, team_a1, team_a2, team_b1, team_b2, is_staff_game, level, matchup_type, played_on, sport, season")
        .eq("id", id)
        .single(),
      supabase
        .from("game_roster")
        .select("game_id, player_id, player_name, team_side, team_name, sort_order")
        .eq("game_id", id)
        .order("team_side", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("live_events")
        .select("player_id, stat_key, delta")
        .eq("game_id", id)
        .eq("event_type", "stat"),
    ]);

    if (gErr) {
      setErr(gErr.message);
      return;
    }
    setGame(g);
    setScoreAInput(String(Number(g.score_a || 0)));
    setScoreBInput(String(Number(g.score_b || 0)));

    if (rErr) {
      setRosterA([]);
      setRosterB([]);
      return;
    }
    let r = r0;

    // Backfill missing sort_order for older rosters (only matters for batting sports,
    // but harmless to store for all). load() re-runs after every stat tap
    // (scheduleReload) and on mount, so on a legacy game this used to fire a
    // fresh sequential round trip per player, per reload, with every write's
    // error silently discarded -- a single failed write left that row's
    // sort_order still null, which re-triggered the whole backfill (and its
    // ignored errors) again on the very next reload. Batched into one
    // Promise.all with the errors actually checked, same fix as the roster
    // insert chunking on live/[id]/page.js.
    if ((r || []).some((x) => x.sort_order === null || x.sort_order === undefined)) {
      const bySide = { A: [], B: [] };
      for (const rr of r || []) {
        const s = rr.team_side === "A" ? "A" : "B";
        bySide[s].push(rr);
      }
      const updates = [];
      for (const side of ["A", "B"]) {
        const list = bySide[side]
          .slice()
          .sort((x, y) => String(x.player_name || "").localeCompare(String(y.player_name || "")));
        for (let i = 0; i < list.length; i++) {
          updates.push(
            supabase
              .from("game_roster")
              .update({ sort_order: i })
              .eq("game_id", id)
              .eq("player_id", list[i].player_id)
          );
        }
      }
      const backfillErr = (await Promise.all(updates)).find((res) => res.error)?.error;
      if (backfillErr) {
        setErr(`Couldn't fix batting order on this older roster: ${backfillErr.message}`);
      } else {
        // reload ordered roster
        const { data: r2, error: r2Err } = await supabase
          .from("game_roster")
          .select("game_id, player_id, player_name, team_side, team_name, sort_order")
          .eq("game_id", id)
          .order("team_side", { ascending: true })
          .order("sort_order", { ascending: true });
        if (r2Err) {
          setErr(`Couldn't reload roster after fixing batting order: ${r2Err.message}`);
        } else {
          r = r2 || r;
        }
      }
    }

    const a = [];
    const b = [];
    for (const row of r || []) {
      if (row.team_side === "A") a.push(row);
      else if (row.team_side === "B") b.push(row);
    }
    setRosterA(a);
    setRosterB(b);

    // Load captains for these teams in this league (season-long) -- this
    // genuinely depends on `g`'s result, so it stays after the round above.
    try {
      const leagueId = norm(g.league_key);
      const teamNames = uniqNonEmpty([g.team_a1, g.team_b1]);
      const caps = await fetchCaptainIds({ leagueId, teamNames });
      setCaptainIds(caps);
    } catch {
      setCaptainIds(new Set());
    }

    if (evErr) {
      setErr(evErr.message);
      setStatTotals({});
      return;
    }

    const totals = {};
    for (const e of ev || []) {
      const pid = String(e.player_id ?? "");
      const k = String(e.stat_key ?? "").toUpperCase();
      const d = Number(e.delta ?? 0);

      if (!totals[pid]) totals[pid] = {};
      totals[pid][k] = Number(totals[pid][k] ?? 0) + d;
    }
    setStatTotals(totals);
  }

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveScore() {
    setErr("");
    setMsg("");
    setSaving(true);

    try {
      const a = Number(scoreAInput);
      const b = Number(scoreBInput);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        setErr("Scores must be numbers.");
        return;
      }
      if (a < 0 || b < 0) {
        setErr("Scores cannot be negative.");
        return;
      }

      const { error } = await supabase.from("live_games").update({ score_a: a, score_b: b }).eq("id", id);
      if (error) setErr(error.message);
      else {
        setMsg("✅ Score saved.");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function addStat(player, statKey, delta = 1) {
    setErr("");
    setMsg("");

    const teamName = String(player?.team_name || "");

    const { error } = await supabase.rpc("rpc_add_stat", {
      p_game_id: id,
      p_league_id: norm(game?.league_key),
      p_sport: norm(game?.sport),
      p_player_id: String(player.player_id ?? player.id ?? ""),
      p_player_name: String(player.player_name ?? ""),
      p_team_name: teamName,
      p_stat_key: String(statKey),
      p_delta: Number(delta),
    });

    if (error) {
      setErr(error.message);
      return;
    }

    setStatTotals((prev) => {
      const pid = String(player.player_id ?? player.id ?? "");
      const key = String(statKey ?? "").toUpperCase();
      const next = { ...(prev || {}) };
      if (!next[pid]) next[pid] = {};
      next[pid][key] = Number(next[pid][key] ?? 0) + Number(delta || 1);
      return next;
    });

    setMsg(`✅ +${statCaption(String(statKey).toUpperCase())} recorded`);
    scheduleReload();
  }

  async function buildRosterIfMissing() {
    setErr("");
    setMsg("");

    // Guard against a double-tap (or a re-render racing the first click)
    // inserting a second full roster for this game — the button below is
    // also hidden once a roster exists, but this is the last line of
    // defense against duplicating every player's roster row.
    if (rosterA.length || rosterB.length) {
      setErr("Roster already exists for this game — refresh instead of building again.");
      return;
    }

    const lk = norm(game?.league_key);
    const matchupType = String(game?.matchup_type || "single");

    const a1 = norm(game?.team_a1);
    const b1 = norm(game?.team_b1);
    const a2 = norm(game?.team_a2);
    const b2 = norm(game?.team_b2);

    const teamsA = uniqNonEmpty([a1, matchupType === "two_team" ? a2 : null]);
    const teamsB = uniqNonEmpty([b1, matchupType === "two_team" ? b2 : null]);
    const allTeams = uniqNonEmpty([...teamsA, ...teamsB]);

    if (!lk || !teamsA.length || !teamsB.length) {
      setErr("Missing league/team info for this draft.");
      return;
    }

    const isCwGame = String(game?.season || "league") === "cw";

    let players, error;
    if (isCwGame) {
      // Color War: match players by cw_team (blue/white), within this age league.
      const res = await supabase
        .from("players")
        .select("id, first_name, last_name, cw_team, team_name, league_id")
        .eq("league_id", lk)
        .in("cw_team", ["blue", "white"])
        .eq("departed", false)
        .limit(5000);
      players = res.data; error = res.error;
    } else {
      const res = await supabase
        .from("players")
        .select("id, first_name, last_name, team_name, league_id")
        .eq("league_id", lk)
        .in("team_name", allTeams)
        .eq("departed", false)
        .limit(5000);
      players = res.data; error = res.error;
    }

    if (error) {
      setErr(error.message);
      return;
    }

    // IMPORTANT: include sort_order so batting order works for softball/kickball
    const orderA = { v: 0 };
    const orderB = { v: 0 };

    const rows = (players || []).map((p) => {
      const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      const tn = isCwGame ? norm(p.cw_team) : norm(p.team_name);
      const side = teamsA.includes(tn) ? "A" : "B";
      const so = side === "A" ? orderA.v++ : orderB.v++;

      return {
        game_id: id,
        player_id: String(p.id),
        player_name: fullName || "Unknown",
        team_side: side,
        team_name: tn,
        is_playing: true,
        sort_order: so,
      };
    });

    if (!rows.length) {
      setErr("No players found for these teams in this league.");
      return;
    }

    const { error: insErr } = await supabase.from("game_roster").insert(rows);
    if (insErr) setErr(insErr.message);
    else {
      setMsg("✅ Roster built.");
      await load();
    }
  }

  async function finalizeDraft() {
    setErr("");
    setMsg("");

    const sa = Number(scoreAInput || 0);
    const sb = Number(scoreBInput || 0);

    if (sa === 0 && sb === 0) {
      setErr("Score is 0-0. Enter a score before finalizing.");
      return;
    }

    if (sa === sb) {
      setErr("Score is tied. Bauercrest has no ties — adjust the score before finalizing.");
      return;
    }

    // Card-data guard: warn if an individual-stat sport has no stats logged.
    const statSports = ["hoop","soccer","euro","hockey","speedball","softball","football","kickball"];
    if (statSports.includes(norm(game?.sport))) {
      let anyStats = false;
      for (const pid of Object.keys(statTotals || {})) {
        for (const k of Object.keys(statTotals[pid] || {})) {
          if (Number(statTotals[pid][k]) > 0) { anyStats = true; break; }
        }
        if (anyStats) break;
      }
      if (!anyStats) {
        const proceed = await confirmAsync(
          "For player cards we want every goal/point/hit recorded. Add stats first, or finalize anyway?",
          { title: "No player stats logged", confirmLabel: "Finalize Anyway" }
        );
        if (!proceed) return;
      }
    }

    const ok = await confirmAsync("This updates standings + stat leaders.", { title: "Finalize this post-game draft?", confirmLabel: "Finalize", danger: false });
    if (!ok) return;

    setFinalizing(true);
    try {
      // C1 fix: ALWAYS write the typed score to the DB before finalizing.
      // finalize_game reads the DB score — without this, finalizing with an
      // unsaved score silently finalized 0-0 (or stale numbers).
      const { error: scoreErr } = await supabase.from("live_games")
        .update({ score_a: sa, score_b: sb })
        .eq("id", id);
      if (scoreErr) { setErr(scoreErr.message); return; }

      const { error } = await supabase.rpc("finalize_game", { gid: id });
      if (error) {
        setErr(error.message);
        return;
      }

      notifyGameFinalized(game, { score_a: sa, score_b: sb });
      setMsg("✅ Finalized. Standings + leaders updated.");
      router.push("/post");
      router.refresh();
    } finally {
      setFinalizing(false);
    }
  }

  if (!game) {
    return (
      <div className="pb-10 pt-4">
        {err ? (
          <ErrorNote>{err}</ErrorNote>
        ) : (
          <div aria-busy="true">
            <div className="bc-skel" style={{ width: 220, height: 40 }} />
            <div className="bc-card mt-6 p-5"><SkeletonRows rows={2} label="Loading draft" /></div>
            <div className="bc-card mt-6 p-5"><SkeletonRows rows={5} label="Loading roster" /></div>
          </div>
        )}
      </div>
    );
  }

  const leftLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_a1, game.team_a2) : game.team_a1;
  const rightLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_b1, game.team_b2) : game.team_b1;

  const isStaff = !!game.is_staff_game;

  const isCap = (playerId) => (captainIds instanceof Set ? captainIds.has(String(playerId)) : false);

  const RowHeaderRightControls = ({ list, p, side }) => {
    if (!showBatting) return null;
    const idx = list.findIndex((x) => x.player_id === p.player_id);
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="w-5 text-center text-sm font-bold text-[var(--ink-2)]">{idx + 1}</div>
        <button
          onClick={() => moveInOrder(p, "up")}
          disabled={idx === 0}
          aria-label={`Move ${p.player_name} up`}
          className="step step-undo"
        >
          ↑
        </button>
        <button
          onClick={() => moveInOrder(p, "down")}
          disabled={idx === list.length - 1}
          aria-label={`Move ${p.player_name} down`}
          className="step step-undo"
        >
          ↓
        </button>
      </div>
    );
  };

  // Plain function (not a component) so rows keep their DOM between renders.
  const renderRoster = (list, side, label) => (
    <div>
      <h3 className="bc-select-label" style={{ fontSize: 13 }}>{label} players</h3>
      {!list.length ? (
        <div className="mt-2 text-[var(--ink-2)]">
          No roster yet. Tap <b>Build roster</b>.
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {list.map((p) => (
            <div key={`${side}-${p.player_id}`} className="lv-row">
              <div className="flex items-center justify-between gap-2">
                <div className="lv-name">
                  {isCap(p.player_id) ? (
                    <>
                      <span className="lv-cap" aria-hidden="true">C</span>
                      <span className="sr-only">Captain </span>
                    </>
                  ) : null}
                  <span>{p.player_name}</span>
                </div>

                <RowHeaderRightControls list={list} p={p} side={side} />
              </div>

              {p.team_name ? <div className="mt-1 text-sm text-[var(--ink-2)]">{p.team_name}</div> : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {statKeys.map((k) => (
                  <div key={`${side}-${p.player_id}-${k}`} className="lv-stat" style={{ padding: "4px 4px 4px 10px" }}>
                    <div className="lv-stat-read">
                      <span className="lv-stat-cap">{statCaption(k)}</span>
                      <span className="lv-stat-val">{getTotal(p.player_id, k)}</span>
                    </div>
                    <button
                      onClick={() => addStat(p, k, 1)}
                      aria-label={`Add ${statCaption(k)} for ${p.player_name}`}
                      className="step"
                    >
                      +1
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="pb-10">
      {confirmModal}
      <div>
        <PageHeader
          title={isStaff ? "Staff game draft" : "Post game draft"}
          description={`${game.played_on} · ${game.league_key} · ${game.sport} · Level ${game.level}`}
        >
          <span className="bc-chip" style={{ borderColor: "var(--warn)", color: "var(--warn-ink)" }}>Draft</span>
          {isStaff ? <span className="bc-chip">Staff</span> : null}
          <Link href="/post" className="btn btn-secondary btn-sm">Back</Link>
          <Link href="/" className="btn btn-secondary btn-sm">Home</Link>
        </PageHeader>

        {err ? <div className="mt-4"><ErrorNote>{err}</ErrorNote></div> : null}
        {msg ? (
          <div role="status" className="mt-4 rounded-md border-[1.5px] border-[var(--good)] p-3 text-sm font-semibold text-[var(--good-ink)]">{msg}</div>
        ) : null}

        {/* Score Entry */}
        <section className="bc-card bc-card-pad mt-6" aria-labelledby="score-entry-h">
          <div className="bc-section-head"><h2 id="score-entry-h">Final score</h2></div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
            <label className="block">
              <span className="bc-select-label">Home · {leftLabel}</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="bc-num w-full"
                style={{ fontSize: 40, minHeight: 64 }}
                value={scoreAInput}
                onChange={(e) => setScoreAInput(e.target.value)}
              />
            </label>

            <button onClick={saveScore} disabled={saving} className="btn btn-secondary md:mb-0.5">
              {saving ? "Saving…" : "Save score"}
            </button>

            <label className="block">
              <span className="bc-select-label">Away · {rightLabel}</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="bc-num w-full"
                style={{ fontSize: 40, minHeight: 64 }}
                value={scoreBInput}
                onChange={(e) => setScoreBInput(e.target.value)}
              />
            </label>
          </div>

          <button
            onClick={finalizeDraft}
            disabled={finalizing}
            className="btn btn-good mt-5 w-full"
            style={{ minHeight: 56, fontSize: 18 }}
          >
            {finalizing ? "Finalizing…" : "Finalize draft"}
          </button>
        </section>

        {/* Optional Stats */}
        <section className="bc-card bc-card-pad mt-6" aria-labelledby="opt-stats-h">
          <div className="bc-section-head">
            <h2 id="opt-stats-h">Player stats</h2>
            {!rosterA.length && !rosterB.length ? (
              <button onClick={buildRosterIfMissing} className="btn btn-secondary btn-sm ml-auto">
                Build roster
              </button>
            ) : null}
          </div>
          <p className="text-[var(--ink-2)]">Optional. If you don&rsquo;t need stats, finalize with the score only.</p>

          {!statKeys.length ? (
            <div className="mt-4"><EmptyState title="No stats for this sport">No stat keys are configured, so finalize with the score only.</EmptyState></div>
          ) : (
            <div className="mt-5 grid gap-8 md:grid-cols-2">
              {renderRoster(rosterA, "A", leftLabel)}
              {renderRoster(rosterB, "B", rightLabel)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
