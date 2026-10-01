"use client";

// ============================================================================
// CREST AWARDS — /awards
// Trophy-ceremony page. During the session: top 3 contenders per award, #1 on
// a gold pedestal, #2 and #3 below. After league ends: same layout, framed as
// final winners. Reads get_awards() (session-aware). No writes.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";
import { useNotifyingErr } from "@/lib/useNotifyingErr";

import { EmptyState, ErrorNote, SkeletonRows } from "@/components/ui";
function fmtLeague(id) {
  const s = String(id || "").toLowerCase();
  if (s === "seniors") return "Seniors";
  if (s === "juniors") return "Juniors";
  if (s === "sophomores") return "Sophomores";
  return id || "";
}

// award display order + a one-line subtitle for each
const AWARD_ORDER = [
  ["mvp", "The best all-around athlete against the best competition"],
  ["most_wins", "Most games won all session"],
  ["iron_man", "Played in more games than anyone"],
  ["sharpshooter", "Most goals across all sports"],
  ["buckets", "Most points on the hardwood"],
  ["playmaker", "Most assists"],
  ["slugger", "Most home runs"],
];

export default function AwardsPage() {
  const { session } = useAppMode();
  const [rows, setRows] = useState([]);
  const [seasonOver, setSeasonOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useNotifyingErr();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        // Independent of each other, so they run together.
        const [{ data, error: awErr }, { data: st, error: stErr }] = await Promise.all([
          supabase.rpc("get_awards", { p_session: session }),
          // "Season over" = current session's league mode has ended. We infer
          // it from app_settings.league_ended if present; otherwise always "race".
          supabase.from("app_settings").select("league_ended").eq("id", 1).maybeSingle(),
        ]);
        if (awErr) throw awErr;
        if (stErr) throw stErr;
        setRows(data || []);
        setSeasonOver(Boolean(st?.league_ended));
      } catch (e) {
        // A failed get_awards() used to fall through to an empty rows array,
        // which renders identically to "no games logged yet" on this public
        // trophy-ceremony page — indistinguishable from a real early-season
        // empty state.
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const byAward = {};
  for (const r of rows) {
    (byAward[r.o_award] = byAward[r.o_award] || []).push(r);
  }
  for (const k of Object.keys(byAward)) byAward[k].sort((a, b) => a.o_rank - b.o_rank);

  return (
    <div className="awards-root cl-banquet pb-20">
      <style>{awardsCSS}</style>

      {/* Banquet header: the stage */}
      <header className="cl-hero aw-stage" style={{ "--hero-pos": "50% 40%" }}>
        <div className="cl-hero-bg" aria-hidden="true" />
        <div className="aw-beam" aria-hidden="true" />
        <div className="cl-hero-in">
          <h1 className="bc-page-title reveal" style={{ fontSize: "clamp(56px, 13vw, 132px)" }}>Crest Awards</h1>
          <p className="reveal max-w-[52ch] text-xl" style={{ "--i": 1, color: "var(--banquet)" }}>
            {seasonOver
              ? "Session champions, decided on the field."
              : "Who's leading each award right now. It's not over yet."}
          </p>
        </div>
      </header>

      {err ? <div className="mt-4"><ErrorNote>{err}</ErrorNote></div> : null}

      {loading ? (
        <div className="mt-8"><SkeletonRows rows={5} label="Loading awards" /></div>
      ) : err ? null : !rows.length ? (
        <div className="mt-8">
          <EmptyState title="No games logged yet">Awards appear once play begins.</EmptyState>
        </div>
      ) : (
        <div className="aw-list">
          {AWARD_ORDER.map(([key, subtitle], idx) => {
            const podium = byAward[key];
            if (!podium || !podium.length) return null;
            const first = podium.find((p) => p.o_rank === 1);
            const rest = podium.filter((p) => p.o_rank > 1);
            const isMVP = key === "mvp";
            return (
              <section key={key} className={`aw-band reveal ${isMVP ? "aw-mvp" : ""}`} style={{ "--i": Math.min(idx, 6) }}>
                <header className="aw-band-head">
                  <h2 className="aw-band-title">{first?.o_award_label || key}</h2>
                  <p className="aw-band-sub">{subtitle}</p>
                </header>

                <div className="aw-band-body">
                  {first ? (
                    <Link href={`/player/${first.o_player_id}`} className="aw-first">
                      <div className="aw-rank" aria-label="First place">1</div>
                      <div className="aw-first-body">
                        <div className="aw-first-name">{first.o_player_name}</div>
                        <div className="aw-first-meta">{fmtLeague(first.o_league_id)} · {first.o_team_name}</div>
                      </div>
                      <div className="aw-first-value">{first.o_display}</div>
                    </Link>
                  ) : null}

                  {rest.length ? (
                    <div className="aw-rest">
                      {rest.map((p) => (
                        <Link key={p.o_player_id} href={`/player/${p.o_player_id}`} className="aw-runner">
                          <div className="aw-runner-rank" aria-label={p.o_rank === 2 ? "Second place" : "Third place"}>{p.o_rank}</div>
                          <div className="aw-runner-body">
                            <div className="aw-runner-name">{p.o_player_name}</div>
                            <div className="aw-runner-meta">{p.o_team_name}</div>
                          </div>
                          <div className="aw-runner-value">{p.o_display}</div>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

const awardsCSS = `
.aw-stage { clip-path: polygon(0 0, 100% 0, 100% calc(100% - 22px), 0 100%); }
.aw-stage::before {
  background:
    linear-gradient(90deg, rgba(5,13,28,0.95), rgba(5,13,28,0.55) 60%, rgba(5,13,28,0.3)),
    linear-gradient(0deg, rgba(5,13,28,0.95), transparent 60%),
    radial-gradient(60% 90% at 80% 0%, rgba(224,178,82,0.25), transparent 70%);
}
.aw-stage::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--banquet);
  box-shadow: 0 0 24px var(--banquet);
}
.aw-beam {
  position: absolute; top: -20%; left: -30%; width: 40%; height: 160%; z-index: 0; pointer-events: none;
  background: linear-gradient(100deg, transparent, rgba(255,236,190,0.18), transparent);
  transform: rotate(14deg); animation: aw-sweep 9s ease-in-out infinite;
}
@keyframes aw-sweep { 0%, 100% { left: -30%; } 50% { left: 85%; } }

.aw-list { margin-top: 28px; display: grid; gap: 18px; }
.aw-band {
  position: relative; display: grid; gap: 18px; padding: 22px 20px;
  background: linear-gradient(180deg, rgba(14,34,72,0.85), rgba(7,16,34,0.9));
  box-shadow: inset 0 0 0 1px var(--rule);
  clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
}
.aw-band::before { content: ""; position: absolute; left: 0; top: 0; width: 84px; height: 3px; background: var(--banquet); box-shadow: 0 0 18px var(--banquet); }
@media (min-width: 900px) { .aw-band { grid-template-columns: 300px 1fr; gap: 32px; padding: 28px 30px; } }
.aw-mvp { box-shadow: inset 0 0 0 1px var(--banquet), 0 0 70px rgba(224,178,82,0.15); background: linear-gradient(180deg, rgba(40,32,14,0.6), rgba(7,16,34,0.92)); }
.aw-band-title { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 40px; line-height: 0.95; text-transform: uppercase; }
.aw-mvp .aw-band-title { font-size: 56px; }
.aw-band-sub { margin-top: 8px; color: var(--ink-2); font-size: 16px; }
.aw-band-body { display: grid; gap: 12px; min-width: 0; }

.aw-first {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 14px 18px; color: inherit;
  background: rgba(224,178,82,0.1); box-shadow: inset 0 0 0 1px var(--banquet);
  transition: background-color .2s, transform .25s cubic-bezier(.16,1,.3,1);
}
.aw-first:hover { background: rgba(224,178,82,0.2); transform: translateX(4px); }
.aw-rank { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 76px; line-height: 0.85; color: var(--banquet); text-shadow: 0 0 30px rgba(224,178,82,0.5); }
.aw-mvp .aw-rank { font-size: 110px; }
.aw-first-body { min-width: 0; }
.aw-first-name { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 36px; line-height: 0.95; text-transform: uppercase; }
.aw-mvp .aw-first-name { font-size: 54px; }
.aw-first-meta { margin-top: 6px; font-family: var(--font-label), sans-serif; font-weight: 600; font-size: 16px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-2); }
.aw-first-value { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 34px; line-height: 1; color: var(--banquet); text-align: right; }
.aw-mvp .aw-first-value { font-size: 46px; }
@media (max-width: 540px) {
  .aw-first { grid-template-columns: auto 1fr; }
  .aw-first-value { grid-column: 1 / -1; text-align: left; border-top: 1px solid var(--rule); padding-top: 10px; }
  .aw-mvp .aw-band-title { font-size: 44px; }
  .aw-mvp .aw-first-name { font-size: 38px; }
}
.aw-rest { display: grid; gap: 0; }
@media (min-width: 640px) { .aw-rest { grid-template-columns: 1fr 1fr; column-gap: 24px; } }
.aw-runner { display: flex; align-items: center; gap: 12px; padding: 12px 4px; color: inherit; border-top: 1px solid var(--rule); transition: background-color .15s; }
.aw-runner:hover { background: rgba(150,190,255,0.08); }
.aw-runner-rank { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 34px; color: var(--ink-3); width: 28px; text-align: center; }
.aw-runner-body { flex: 1; min-width: 0; }
.aw-runner-name { font-weight: 700; font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aw-runner-meta { font-family: var(--font-label), sans-serif; font-weight: 600; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }
.aw-runner-value { font-weight: 800; font-size: 18px; white-space: nowrap; }
`;
