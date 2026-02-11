"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function sortRosterRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ao = Number(a.sort_order ?? 0);
    const bo = Number(b.sort_order ?? 0);
    if (ao !== bo) return ao - bo;
    return String(a.player_name || "").localeCompare(String(b.player_name || ""));
  });
}

export default function PostGameDraftPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [game, setGame] = useState(null);
  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);

  // Player metadata (for captain label / consistent names)
  const [playersById, setPlayersById] = useState({});

  async function loadPlayerMeta(playerIds) {
    const ids = [...new Set((playerIds || []).filter(Boolean))];
    if (!ids.length) {
      setPlayersById({});
      return;
    }

    let res = await supabase
      .from("players")
      .select("id, first_name, last_name, team_name, league_id, role")
      .in("id", ids)
      .limit(5000);

    if (res.error) {
      res = await supabase
        .from("players")
        .select("id, first_name, last_name, team_name, league_id")
        .in("id", ids)
        .limit(5000);

      if (res.error) return;
    }

    const map = {};
    for (const p of res.data || []) map[p.id] = p;
    setPlayersById(map);
  }

  function displayNameForRosterRow(row) {
    const meta = playersById?.[row.player_id];
    const base =
      (row.player_name && String(row.player_name).trim()) ||
      (meta ? `${String(meta.first_name || "").trim()} ${String(meta.last_name || "").trim()}`.trim() : "") ||
      String(row.player_id || "");

    const role = String(meta?.role || "").toLowerCase();
    if (role === "captain") return `${base} (C)`;
    if (role === "coach") return `${base} (Coach)`;
    return base;
  }

  const statDefs = useMemo(() => {
    const raw = String(game?.stat_keys || "").trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => norm(s))
      .filter(Boolean)
      .map((k) => ({ key: k, label: k.toUpperCase() }));
  }, [game?.stat_keys]);

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setErr("");
    setMsg("");

    const { data: g, error: gErr } = await supabase.from("live_games").select("*").eq("id", id).single();
    if (gErr) {
      setErr(gErr.message);
      return;
    }
    setGame(g);

    const { data: r, error: rErr } = await supabase
      .from("game_roster")
      .select("game_id, player_id, player_name, team_side, team_name, is_playing, sort_order")
      .eq("game_id", id);

    if (rErr) {
      setRosterA([]);
      setRosterB([]);
      return;
    }

    const a = sortRosterRows((r || []).filter((x) => x.team_side === "A"));
    const b = sortRosterRows((r || []).filter((x) => x.team_side === "B"));
    setRosterA(a);
    setRosterB(b);

    loadPlayerMeta((r || []).map((x) => x.player_id));
  }

  async function addStat(playerId, statKey) {
    setErr("");
    const { error } = await supabase.from("live_events").insert({
      game_id: id,
      event_type: "stat",
      player_id: playerId,
      stat_key: statKey,
      delta: 1,
      team_name:
        rosterA.find((x) => x.player_id === playerId)?.team_name ||
        rosterB.find((x) => x.player_id === playerId)?.team_name ||
        null,
      created_at: new Date().toISOString(),
    });

    if (error) setErr(error.message);
  }

  async function finalizeDraft() {
    setErr("");
    setMsg("");

    const ok = confirm("Finalize this post game draft? This will update standings and stat leaders.");
    if (!ok) return;

    const { error } = await supabase.rpc("finalize_game", { gid: id });
    if (error) {
      setErr(error.message);
      return;
    }

    setMsg("Finalized ✅");
    router.push("/post");
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl p-6">Loading…</div>
      </div>
    );
  }

  const teamA = game.team_a1 || "Home";
  const teamB = game.team_b1 || "Away";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-3xl font-black">Post Game Draft</div>
            <div className="text-sm text-white/60">
              {game.game_date} • {game.league_key} • {game.sport} • Level {game.level} • <span className="font-black text-yellow-300">draft</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/post" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-extrabold">
              Back
            </Link>
            <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-extrabold">
              Home
            </Link>
          </div>
        </div>

        {err ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}
        {msg ? (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {msg}
          </div>
        ) : null}

        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs text-white/60">FINALIZE</div>
          <div className="mt-2 flex justify-center">
            <button
              onClick={finalizeDraft}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-8 py-3 text-base font-black text-emerald-100 active:scale-95"
            >
              Finalize Draft
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-lg font-black">{teamA} Players</div>
            <div className="flex flex-col gap-2">
              {sortRosterRows(rosterA).map((p) => (
                <div key={p.player_id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-base font-extrabold">{displayNameForRosterRow(p)}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {statDefs.map((sd) => (
                      <button
                        key={`${p.player_id}-${sd.key}`}
                        onClick={() => addStat(p.player_id, sd.key)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/90 active:scale-95"
                      >
                        +{sd.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-lg font-black">{teamB} Players</div>
            <div className="flex flex-col gap-2">
              {sortRosterRows(rosterB).map((p) => (
                <div key={p.player_id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-base font-extrabold">{displayNameForRosterRow(p)}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {statDefs.map((sd) => (
                      <button
                        key={`${p.player_id}-${sd.key}`}
                        onClick={() => addStat(p.player_id, sd.key)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/90 active:scale-95"
                      >
                        +{sd.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
