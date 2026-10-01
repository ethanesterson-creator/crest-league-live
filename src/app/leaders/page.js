"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { getSportRules } from "@/lib/sportRules";

import { PageHeader, Field, Sheet, EmptyState, ErrorNote, SkeletonRows, Meter } from "@/components/ui";
import FlashNumber from "@/components/FlashNumber";
const SPORTS = [
  "Hoop",
  "Soccer",
  "Softball",
  "Kickball",
  "Volleyball",
  "Football",
  "Speedball",
  "Euro",
  "Hockey",
  "Newcomb",
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
  const { season, session } = useAppMode();
  const [err, setErr] = useNotifyingErr();  const [loading, setLoading] = useState(true);

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
        .eq("season", season)
        .eq("session", session)
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
    // Independent of each other -- loadLeaders uses leagueId's default
    // state value, not loadLeagues' result -- so they run together.
    loadLeagues();
    loadLeaders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload when filters change
  useEffect(() => {
    loadLeaders({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, sport, statKey, season, session]);

  const statLabel = useMemo(() => prettyStatLabel(sport, statKey), [sport, statKey]);

  const leaderVal = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="pb-10">
      <PageHeader title="Stat leaders" description="Updates the moment a game is finalized." pos="50% 88%">
        <div className="grid w-full grid-cols-2 gap-3 md:flex md:w-auto md:items-end">
          <Field label="League">
            <select
              className="bc-select"
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
          </Field>

          <Field label="Sport">
            <select
              className="bc-select"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
            >
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Stat">
            <select
              className="bc-select"
              value={statKey}
              onChange={(e) => setStatKey(e.target.value)}
            >
              {statOptions.map((st) => (
                <option key={st.key} value={st.key}>
                  {st.label}
                </option>
              ))}
            </select>
          </Field>

          <button className="btn btn-secondary self-end" onClick={() => loadLeaders()}>
            Refresh
          </button>
        </div>
      </PageHeader>

      {err ? <div className="mt-4"><ErrorNote onRetry={() => loadLeaders()}>{err}</ErrorNote></div> : null}

      <div className="bc-section-head reveal mt-6">
        <h2>{prettyLeague(leagueId)} · {sport} · {statLabel}</h2>
        <span className="bc-label">Top 50</span>
      </div>

      {loading ? (
        <Sheet><SkeletonRows rows={8} label="Loading stat leaders" /></Sheet>
      ) : rows.length ? (
        <>
          {/* Podium: the top three, #1 raised in the middle */}
          <div className="podium" key={`${leagueId}-${sport}-${statKey}`}>
            {top3.map((r, i) => (
              <Link
                key={`${r.player_id}-${r.stat_key}`}
                href={`/player/${r.player_id}`}
                className={`pod reveal ${i === 0 ? "first" : ""}`}
                style={{ "--i": i === 0 ? 1 : i === 1 ? 0 : 2 }}
              >
                <div className="pod-ghost" aria-hidden="true">{i + 1}</div>
                <div className="pod-name">{r.player_name}</div>
                <FlashNumber as="div" className="pod-val" value={Number(r.value)} />
                <div className="mt-2 bc-label">{statLabel} · {r.team_name}</div>
              </Link>
            ))}
          </div>

          {/* The rest of the table, each row scaled against the leader */}
          {rest.length ? (
            <Sheet className="mt-6" title="The chasing pack">
              <ul>
                {rest.map((r, idx) => (
                  <li key={`${r.player_id}-${r.stat_key}`} className="grid grid-cols-[44px_1fr_auto] items-center gap-x-4 gap-y-2 border-t border-[var(--rule)] py-3 first:border-t-0">
                    <span className="bc-rank">{idx + 4}</span>
                    <div className="min-w-0">
                      <Link href={`/player/${r.player_id}`} className="block truncate text-xl font-bold hover:text-[var(--accent-2)]">
                        {r.player_name}
                      </Link>
                      <div className="bc-label" style={{ fontSize: 13 }}>{r.team_name}</div>
                    </div>
                    <FlashNumber as="div" className="bc-num text-4xl leading-none" value={Number(r.value)} />
                    <div className="col-span-3"><Meter value={r.value} max={leaderVal} index={idx} /></div>
                  </li>
                ))}
              </ul>
            </Sheet>
          ) : null}
        </>
      ) : (
        <EmptyState title="No stats yet">
          Nothing for this filter. Finalize a game to populate the leaderboard.
        </EmptyState>
      )}
    </div>
  );
}
