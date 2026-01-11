"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

export default function PostDraftEditorPage() {
  const params = useParams();
  const id = params?.id;

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [game, setGame] = useState(null);

  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);

  const rules = useMemo(() => getSportRules(game?.sport || "Hoop"), [game?.sport]);
  const scoreDeltas = rules?.scoring?.buttons ?? [1];

  async function load() {
    setErr("");
    setMsg("");

    const { data: g, error: gErr } = await supabase
      .from("live_games")
      .select("*")
      .eq("id", id)
      .single();

    if (gErr) {
      setErr(gErr.message);
      return;
    }
    setGame(g);

    // load roster for both teams
    const { data: r, error: rErr } = await supabase
      .from("game_roster")
      .select("*")
      .eq("game_id", id);

    if (rErr) {
      // roster might not exist yet; that's okay
      setRosterA([]);
      setRosterB([]);
      return;
    }

    const a = [];
    const b = [];
    for (const row of r || []) {
      if (row.side === "A") a.push(row);
      else if (row.side === "B") b.push(row);
    }
    setRosterA(a);
    setRosterB(b);
  }

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addScore(side, delta) {
    setErr("");
    const { error } = await supabase.rpc("rpc_add_score", {
      p_game_id: id,
      p_side: side,
      p_delta: Number(delta),
    });
    if (error) setErr(error.message);
    else await load();
  }

  async function addStat(side, player, statKey, delta = 1) {
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
    // If roster is empty, auto-build it from players table for both teams.
    // This helps post-game entry: they pick teams, then get a roster to stat.
    const ta = norm(game?.team_a1);
    const tb = norm(game?.team_b1);
    const lk = norm(game?.league_key);

    if (!ta || !tb || !lk) return;

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
      side: norm(p.team_name) === ta ? "A" : "B",
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
      setMsg("✅ Roster built. You can now enter optional stats.");
      await load();
    }
  }

  async function finalizeDraft() {
    setErr("");
    setMsg("");

    const ok = confirm(
      "Finalize this draft?\n\nThis will lock it in and update standings + stat leaders."
    );
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
          {err ? (
            <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const statKeys = rules?.stats?.keys ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight">Post Game Draft</div>
            <div className="mt-1 text-sm text-white/70">
              {game.played_on} • {game.league_key} • {game.sport} • Level {game.level} •{" "}
              <span className="font-bold text-yellow-300">draft</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href="/post"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Back
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Home
            </Link>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {msg ? (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            {msg}
          </div>
        ) : null}

        {/* Score card */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-white/60">HOME</div>
              <div className="text-3xl font-black">{game.team_a1}</div>
              <div className="mt-2 text-6xl font-black tabular-nums">
                {Number(game.score_a || 0)}
              </div>
              <div className="mt-3 flex gap-2">
                {scoreDeltas.map((d) => (
                  <button
                    key={`A-${d}`}
                    onClick={() => addScore("A", d)}
                    className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-lg font-extrabold hover:bg-white/15"
                  >
                    +{d}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs tracking-widest text-white/60">FINAL SCORE ENTRY</div>
              <button
                onClick={finalizeDraft}
                className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/15"
              >
                Finalize Draft
              </button>
            </div>

            <div className="text-right">
              <div className="text-sm text-white/60">AWAY</div>
              <div className="text-3xl font-black">{game.team_b1}</div>
              <div className="mt-2 text-6xl font-black tabular-nums">
                {Number(game.score_b || 0)}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                {scoreDeltas.map((d) => (
                  <button
                    key={`B-${d}`}
                    onClick={() => addScore("B", d)}
                    className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-lg font-extrabold hover:bg-white/15"
                  >
                    +{d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats section (optional) */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-black">Optional Player Stats</div>
              <div className="text-sm text-white/70">
                If you don’t need stats, you can finalize with score only.
              </div>
            </div>

            <button
              onClick={buildRosterIfMissing}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Build Roster
            </button>
          </div>

          {!statKeys.length ? (
            <div className="mt-4 text-sm text-white/60">
              This sport has no stat keys configured.
            </div>
          ) : (
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <div className="text-base font-black">{game.team_a1} Players</div>
                {!rosterA.length ? (
                  <div className="mt-2 text-sm text-white/60">
                    No roster yet. Click <b>Build Roster</b> to pull players.
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {rosterA.map((p) => (
                      <div
                        key={`A-${p.player_id}`}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="font-black">{p.player_name}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {statKeys.map((k) => (
                            <button
                              key={k}
                              onClick={() => addStat("A", p, k, 1)}
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
                  <div className="mt-2 text-sm text-white/60">
                    No roster yet. Click <b>Build Roster</b> to pull players.
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {rosterB.map((p) => (
                      <div
                        key={`B-${p.player_id}`}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="font-black">{p.player_name}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {statKeys.map((k) => (
                            <button
                              key={k}
                              onClick={() => addStat("B", p, k, 1)}
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
