"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSportRules } from "@/lib/sportRules";

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

function prettyStatLabel(sportName, statKey) {
  const rules = getSportRules(sportName);
  const def = (rules?.stats ?? []).find((x) => norm(x.key) === norm(statKey));
  return def?.label ?? String(statKey ?? "").toUpperCase();
}

export default function LeadersPage() {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState("seniors");

  const [sport, setSport] = useState("Hoop");

  const rules = useMemo(() => getSportRules(sport), [sport]);
  const statOptions = useMemo(() => rules?.stats ?? [], [rules]);

  const [statKey, setStatKey] = useState("pts");
  const [rows, setRows] = useState([]);

  // when sport changes, set default stat to first available
  useEffect(() => {
    const first = statOptions?.[0]?.key;
    if (first) setStatKey(first);
  }, [sport]); // intentionally only on sport change

  async function loadLeagues() {
    const { data, error } = await supabase
      .from("leagues")
      .select("id, name")
      .order("id", { ascending: true });

    if (error) {
      // fallback
      setLeagues([
        { id: "sophomores", name: "Sophomores" },
        { id: "juniors", name: "Juniors" },
        { id: "seniors", name: "Seniors" },
      ]);
      return;
    }

    setLeagues(data || []);
  }

  async function loadLeaders({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setErr("");

    try {
      const sportKey = norm(sport);
      const stat = norm(statKey);

      const { data, error } = await supabase
        .from("player_totals")
        .select("league_id, sport, player_id, player_name, team_name, stat_key, value, updated_at")
        .eq("league_id", norm(leagueId))
        .eq("sport", sportKey)
        .eq("stat_key", stat)
        .order("value", { ascending: false })
        .limit(50);

      if (error) throw error;

      setRows(data || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadLeagues();
      await loadLeaders();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload when filters change
  useEffect(() => {
    loadLeaders({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, sport, statKey]);

  const statLabel = useMemo(() => prettyStatLabel(sport, statKey), [sport, statKey]);

  return (
    <div className="pb-10">
      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-black">Stat Leaders</div>
          <div className="text-sm text-white/70">
            Updates automatically after you finalize a game.
          </div>
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

          <button
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
            onClick={() => loadLeaders()}
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-lg font-black">
            {prettyLeague(leagueId)} • {sport} • {statLabel}
          </div>
          <div className="text-xs text-white/60">Top 50</div>
        </div>

        {loading ? (
          <div className="mt-4 text-white/70">Loading…</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/70">
                <tr>
                  <th className="py-2">#</th>
                  <th className="py-2">Player</th>
                  <th className="py-2">Team</th>
                  <th className="py-2 text-right">{statLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((r, idx) => (
                    <tr key={`${r.player_id}-${r.stat_key}`} className="border-t border-white/10">
                      <td className="py-3 font-black">{idx + 1}</td>
                      <td className="py-3 font-extrabold">{r.player_name}</td>
                      <td className="py-3 text-white/80">{r.team_name}</td>
                      <td className="py-3 text-right font-black tabular-nums">{r.value}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-4 text-white/60" colSpan={4}>
                      No stats yet for this filter. Finalize a game to populate stat leaders.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-3 text-xs text-white/50">
              Tip: Stat leaders update when a game is finalized (they pull from <b>player_totals</b>).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
