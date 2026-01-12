"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
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

export default function PostDraftEditorPage() {
  const params = useParams();
  const id = params?.id;

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [game, setGame] = useState(null);

  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);

  const statKeys = useMemo(() => getStatKeysForSport(game?.sport), [game?.sport]);

  const [scoreAInput, setScoreAInput] = useState("0");
  const [scoreBInput, setScoreBInput] = useState("0");

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

    const ta = norm(g.team_a1);
    const tb = norm(g.team_b1);

    const a = [];
    const b = [];
    for (const row of r || []) {
      const rt = norm(row.team_name);
      if (rt === ta) a.push(row);
      else if (rt === tb) b.push(row);
    }
    setRosterA(a);
    setRosterB(b);
  }

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveScore() {
    setErr("");
    setMsg("");

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
  }

  async function addStat(player, statKey, delta = 1) {
    setErr("");
    const { error } = await supabase.rpc("rpc_add_stat", {
      p_game_id: id,
      p_league_id: norm(game?.league_key),
      p_sport: String(game?.sport ?? ""),
      p_player_id: String(player.player_id ?? player.id ?? ""),
      p_player_name: String(player.player_name ?? ""),
      p_team_name: String(player.team_name ?? ""),
      p_stat_key: String(statKey),
      p_delta: Number(delta),
    });
    if (error) setErr(error.message);
    else await load();
  }

  async function buildRosterIfMissing() {
    setErr("");
    setMsg("");

    const ta = norm(game?.team_a1);
    const tb = norm(game?.team_b1);
    const lk = norm(game?.league_key);

    if (!ta || !tb || !lk) {
      setErr("Missing league/team info for this draft.");
      return;
    }

    const { data: players, error } = await supabase
      .from("players")
      .select("*")
      .eq("league_id", lk)
      .in("team_name", [ta, tb])
      .limit(5000);

    if (error) {
      setErr(error.message);
      return;
    }

    const rows = (players || []).map((p) => ({
      game_id: id,
      player_id: String(p.player_id ?? p.id ?? ""),
      player_name: p.player_name ?? p.name ?? "",
      team_name: norm(p.team_name),
    }));

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

    const { error } = await supabase.rpc("finalize_game", { gid: id });
    if (error) {
      setErr(error.message);
      return;
    }

    setMsg("✅ Finalized. Standings + leaders updated.");
    await load();
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="text-lg font-black">Loading draft…</div>
          {err ? <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight">Post Game Draft</div>
            <div className="mt-1 text-sm text-white/70">
              {game.played_on} • {game.league_key} • {game.sport} • Level {game.level} • <span className="font-bold text-yellow-300">draft</span>
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
              <div className="text-2xl font-black">{game.team_a1}</div>
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
              className="rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-white/90"
            >
              Save Score
            </button>

            <div className="text-right">
              <div className="text-xs text-white/60">AWAY</div>
              <div className="text-2xl font-black">{game.team_b1}</div>
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
            className="mt-5 w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/15"
          >
            Finalize Draft
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
                <div className="text-base font-black">{game.team_a1} Players</div>
                {!rosterA.length ? (
                  <div className="mt-2 text-sm text-white/60">No roster yet. Click <b>Build Roster</b>.</div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {rosterA.map((p) => (
                      <div key={`A-${p.player_id}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="font-black">{p.player_name}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {statKeys.map((k) => (
                            <button
                              key={k}
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
                <div className="text-base font-black">{game.team_b1} Players</div>
                {!rosterB.length ? (
                  <div className="mt-2 text-sm text-white/60">No roster yet. Click <b>Build Roster</b>.</div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {rosterB.map((p) => (
                      <div key={`B-${p.player_id}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="font-black">{p.player_name}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {statKeys.map((k) => (
                            <button
                              key={k}
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
