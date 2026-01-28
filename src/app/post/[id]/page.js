"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
  if (s === "hoop") return ["PTS", "AST", "REB", "BLK"];
  if (s === "soccer") return ["G", "A", "S"];
  if (s === "speedball") return ["G", "A", "S"];
  if (s === "euro") return ["G", "A", "S"];
  if (s === "hockey") return ["G", "A", "S"];
  if (s === "softball") return ["H", "HR", "SO", "RBI"];
  if (s === "volleyball") return ["Aces", "Kills"];
  if (s === "football") return ["TD", "INT"];
  return [];
}

function uniqNonEmpty(arr) {
  return Array.from(new Set((arr || []).map((x) => norm(x)).filter(Boolean)));
}

export default function PostDraftEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [game, setGame] = useState(null);

  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);

  const [statTotals, setStatTotals] = useState({});

  const statKeys = useMemo(() => getStatKeysForSport(game?.sport), [game?.sport]);

  const [scoreAInput, setScoreAInput] = useState("0");
  const [scoreBInput, setScoreBInput] = useState("0");

  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  function getTotal(playerId, statKey) {
    const pid = String(playerId ?? "");
    const key = String(statKey ?? "").toUpperCase();
    return Number(statTotals?.[pid]?.[key] ?? 0);
  }

  async function load() {
    setErr("");
    setMsg("");

    const { data: g, error: gErr } = await supabase.from("live_games").select("*").eq("id", id).single();
    if (gErr) {
      setErr(gErr.message);
      return;
    }
    setGame(g);
    setScoreAInput(String(Number(g.score_a || 0)));
    setScoreBInput(String(Number(g.score_b || 0)));

    const { data: r, error: rErr } = await supabase.from("game_roster").select("*").eq("game_id", id);
    if (rErr) {
      setRosterA([]);
      setRosterB([]);
      return;
    }

    const a = [];
    const b = [];
    for (const row of r || []) {
      if (row.team_side === "A") a.push(row);
      else if (row.team_side === "B") b.push(row);
    }
    setRosterA(a);
    setRosterB(b);

    const { data: ev, error: evErr } = await supabase
      .from("live_events")
      .select("player_id, stat_key, delta")
      .eq("game_id", id)
      .eq("event_type", "stat");

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
      p_sport: String(game?.sport ?? ""),
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

    setMsg(`✅ +${statKey} recorded`);
    await load();
  }

  async function buildRosterIfMissing() {
    setErr("");
    setMsg("");

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

    const { data: players, error } = await supabase
      .from("players")
      .select("id, first_name, last_name, team_name, league_id")
      .eq("league_id", lk)
      .in("team_name", allTeams)
      .limit(5000);

    if (error) {
      setErr(error.message);
      return;
    }

    const rows = (players || []).map((p) => {
      const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      const tn = norm(p.team_name);
      const side = teamsA.includes(tn) ? "A" : "B";

      return {
        game_id: id,
        player_id: String(p.id),
        player_name: fullName || "Unknown",
        team_side: side,
        team_name: tn,
        is_playing: true,
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

    const ok = confirm("Finalize this post-game draft?\n\nThis updates standings + stat leaders.");
    if (!ok) return;

    setFinalizing(true);
    try {
      const { error } = await supabase.rpc("finalize_game", { gid: id });
      if (error) {
        setErr(error.message);
        return;
      }

      setMsg("✅ Finalized. Standings + leaders updated.");
      router.push("/post");
      router.refresh();
    } finally {
      setFinalizing(false);
    }
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="text-lg font-black">Loading draft…</div>
          {err ? (
            <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div>
          ) : null}
        </div>
      </div>
    );
  }

  const leftLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_a1, game.team_a2) : game.team_a1;
  const rightLabel = game.matchup_type === "two_team" ? matchupLabel(game.team_b1, game.team_b2) : game.team_b1;

  const isStaff = !!game.is_staff_game;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-black tracking-tight">{isStaff ? "Staff Game Draft" : "Post Game Draft"}</div>
              {isStaff ? (
                <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-1 text-[11px] font-black text-purple-100">
                  STAFF
                </span>
              ) : null}
            </div>

            <div className="mt-1 text-sm text-white/70">
              {game.played_on} • {game.league_key} • {game.sport} • Level {game.level} •{" "}
              <span className="font-bold text-yellow-300">draft</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/post" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10">
              Back
            </Link>
            <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10">
              Home
            </Link>
          </div>
        </div>

        {err ? <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div> : null}
        {msg ? <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{msg}</div> : null}

        {/* Score Entry */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm tracking-widest text-white/60">FINAL SCORE ENTRY</div>

          <div className="mt-4 grid gap-4 md:grid-cols-3 md:items-end">
            <div>
              <div className="text-xs text-white/60">HOME</div>
              <div className="text-2xl font-black">{leftLabel}</div>
              <input
                type="number"
                min="0"
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xl font-black tabular-nums outline-none focus:border-slate-500"
                value={scoreAInput}
                onChange={(e) => setScoreAInput(e.target.value)}
              />
            </div>

            <button
              onClick={saveScore}
              disabled={saving}
              className="rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-white/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Score"}
            </button>

            <div className="text-right">
              <div className="text-xs text-white/60">AWAY</div>
              <div className="text-2xl font-black">{rightLabel}</div>
              <input
                type="number"
                min="0"
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xl font-black tabular-nums outline-none focus:border-slate-500"
                value={scoreBInput}
                onChange={(e) => setScoreBInput(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={finalizeDraft}
            disabled={finalizing}
            className="mt-5 w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-60"
          >
            {finalizing ? "Finalizing..." : "Finalize Draft"}
          </button>
        </div>

        {/* Optional Stats */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-black">Optional Player Stats</div>
              <div className="text-sm text-white/70">If you don’t need stats, finalize with score only.</div>
            </div>

            <button
              onClick={buildRosterIfMissing}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Build Roster
            </button>
          </div>

          {!statKeys.length ? (
            <div className="mt-4 text-sm text-white/60">No stat keys configured for this sport.</div>
          ) : (
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <div className="text-base font-black">{leftLabel} Players</div>
                {!rosterA.length ? (
                  <div className="mt-2 text-sm text-white/60">
                    No roster yet. Click <b>Build Roster</b>.
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {rosterA.map((p) => (
                      <div key={`A-${p.player_id}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="font-black">{p.player_name}</div>
                        {p.team_name ? <div className="mt-1 text-xs text-white/50">{p.team_name}</div> : null}

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/80">
                          {statKeys.map((k) => (
                            <div key={`A-${p.player_id}-${k}`} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                              <span className="font-extrabold">{k}</span> <span className="tabular-nums">{getTotal(p.player_id, k)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {statKeys.map((k) => (
                            <button
                              key={`A-btn-${p.player_id}-${k}`}
                              onClick={() => addStat(p, k, 1)}
                              className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-extrabold hover:bg-white/15"
                            >
                              +{k}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-base font-black">{rightLabel} Players</div>
                {!rosterB.length ? (
                  <div className="mt-2 text-sm text-white/60">
                    No roster yet. Click <b>Build Roster</b>.
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {rosterB.map((p) => (
                      <div key={`B-${p.player_id}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="font-black">{p.player_name}</div>
                        {p.team_name ? <div className="mt-1 text-xs text-white/50">{p.team_name}</div> : null}

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/80">
                          {statKeys.map((k) => (
                            <div key={`B-${p.player_id}-${k}`} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                              <span className="font-extrabold">{k}</span> <span className="tabular-nums">{getTotal(p.player_id, k)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {statKeys.map((k) => (
                            <button
                              key={`B-btn-${p.player_id}-${k}`}
                              onClick={() => addStat(p, k, 1)}
                              className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-extrabold hover:bg-white/15"
                            >
                              +{k}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
