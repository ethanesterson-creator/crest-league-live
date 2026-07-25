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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.rpc("get_awards", { p_session: session });
        setRows(data || []);

        // "Season over" = current session's league mode has ended. We infer it
        // from app_settings.league_ended if present; otherwise always "race".
        const { data: st } = await supabase
          .from("app_settings").select("league_ended").eq("id", 1).maybeSingle();
        setSeasonOver(Boolean(st?.league_ended));
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const byAward = {};
  for (const r of rows) {
    (byAward[r.award] = byAward[r.award] || []).push(r);
  }
  for (const k of Object.keys(byAward)) byAward[k].sort((a, b) => a.rank - b.rank);

  return (
    <div className="awards-root pb-20">
      <style>{awardsCSS}</style>

      {/* Hero */}
      <div className="aw-hero">
        <div className="aw-hero-eyebrow">{seasonOver ? "Final Results" : "The Race Is On"}</div>
        <h1 className="aw-hero-title">
          Crest <span className="aw-gold-text">Awards</span>
        </h1>
        <div className="aw-hero-sub">
          {seasonOver
            ? "Session champions, decided on the field."
            : "Who's leading each award right now. It's not over yet."}
        </div>
      </div>

      {loading ? (
        <div className="aw-loading">Tallying the votes…</div>
      ) : !rows.length ? (
        <div className="aw-loading">No games logged yet. Awards appear once play begins.</div>
      ) : (
        <div className="aw-grid">
          {AWARD_ORDER.map(([key, subtitle]) => {
            const podium = byAward[key];
            if (!podium || !podium.length) return null;
            const first = podium.find((p) => p.rank === 1);
            const rest = podium.filter((p) => p.rank > 1);
            const isMVP = key === "mvp";
            return (
              <section key={key} className={`aw-card ${isMVP ? "aw-card-mvp" : ""}`}>
                <header className="aw-card-head">
                  <div className="aw-card-title">{first?.award_label || key}</div>
                  <div className="aw-card-sub">{subtitle}</div>
                </header>

                {/* Gold — first place */}
                {first ? (
                  <Link href={`/player/${first.player_id}`} className="aw-first">
                    <div className="aw-medal">🥇</div>
                    <div className="aw-first-body">
                      <div className="aw-first-name">{first.player_name}</div>
                      <div className="aw-first-meta">
                        {fmtLeague(first.league_id)} · {first.team_name}
                      </div>
                      <div className="aw-first-value">{first.display}</div>
                    </div>
                  </Link>
                ) : null}

                {/* Silver + bronze */}
                {rest.length ? (
                  <div className="aw-rest">
                    {rest.map((p) => (
                      <Link key={p.player_id} href={`/player/${p.player_id}`} className="aw-runner">
                        <div className="aw-runner-medal">{p.rank === 2 ? "🥈" : "🥉"}</div>
                        <div className="aw-runner-body">
                          <div className="aw-runner-name">{p.player_name}</div>
                          <div className="aw-runner-meta">{p.team_name}</div>
                        </div>
                        <div className="aw-runner-value">{p.display}</div>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

const awardsCSS = `
.awards-root {
  --gold: #f5c451;
  --gold-deep: #b8860b;
  --silver: #cbd5e1;
  --bronze: #c8865a;
  --ink: #0a1730;
}
.aw-hero { text-align:center; padding: 32px 16px 20px; }
.aw-hero-eyebrow {
  font-size: 13px; font-weight: 900; letter-spacing: .35em; text-transform: uppercase;
  color: var(--gold);
}
.aw-hero-title {
  font-size: clamp(40px, 8vw, 76px); font-weight: 900; line-height: .95; margin-top: 8px;
  letter-spacing: -.02em;
}
.aw-gold-text {
  background: linear-gradient(180deg, #ffe9a8 0%, var(--gold) 45%, var(--gold-deep) 100%);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.aw-hero-sub { margin-top: 10px; color: rgba(255,255,255,.6); font-size: 16px; font-weight: 600; }
.aw-loading { text-align:center; padding: 60px 0; color: rgba(255,255,255,.5); font-weight: 800; }

.aw-grid {
  margin-top: 22px; display: grid; gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}
@media (min-width: 900px) { .aw-grid { gap: 24px; } }

.aw-card {
  border: 1px solid rgba(255,255,255,.10);
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
  border-radius: 26px; padding: 22px; backdrop-filter: blur(6px);
}
.aw-card-mvp {
  grid-column: 1 / -1;
  border: 1px solid rgba(245,196,81,.45);
  background:
    radial-gradient(120% 140% at 50% 0%, rgba(245,196,81,.14), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
  box-shadow: 0 0 60px rgba(245,196,81,.12);
}
.aw-card-head { text-align:center; margin-bottom: 16px; }
.aw-card-title {
  font-size: 22px; font-weight: 900; letter-spacing: -.01em;
}
.aw-card-mvp .aw-card-title { font-size: 30px; }
.aw-card-sub { margin-top: 4px; font-size: 12.5px; color: rgba(255,255,255,.45); font-weight: 600; }

/* First place */
.aw-first {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 20px; border-radius: 20px; text-decoration: none; color: inherit;
  background:
    radial-gradient(90% 120% at 50% -10%, rgba(245,196,81,.18), transparent 60%);
  border: 1px solid rgba(245,196,81,.30);
  transition: transform .15s ease, box-shadow .15s ease;
}
.aw-first:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(0,0,0,.35); }
.aw-medal { font-size: 46px; line-height: 1; filter: drop-shadow(0 4px 12px rgba(245,196,81,.5)); }
.aw-card-mvp .aw-medal { font-size: 60px; }
.aw-first-body { text-align:center; }
.aw-first-name {
  font-size: 26px; font-weight: 900; letter-spacing:-.01em;
}
.aw-card-mvp .aw-first-name { font-size: 40px; }
.aw-first-meta {
  margin-top: 2px; font-size: 12px; text-transform: uppercase; letter-spacing:.12em;
  color: rgba(255,255,255,.5); font-weight: 800;
}
.aw-first-value {
  margin-top: 10px; display:inline-block;
  padding: 6px 16px; border-radius: 999px;
  background: linear-gradient(180deg, #ffe9a8, var(--gold));
  color: #3a2a05; font-weight: 900; font-size: 15px;
}
.aw-card-mvp .aw-first-value { font-size: 18px; padding: 8px 22px; }

/* Runners up */
.aw-rest { margin-top: 12px; display: grid; gap: 8px; }
.aw-card-mvp .aw-rest { grid-template-columns: 1fr 1fr; }
.aw-runner {
  display:flex; align-items:center; gap: 12px;
  padding: 12px 14px; border-radius: 16px; text-decoration: none; color: inherit;
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08);
  transition: background .15s ease;
}
.aw-runner:hover { background: rgba(255,255,255,.07); }
.aw-runner-medal { font-size: 24px; }
.aw-runner-body { flex: 1; min-width: 0; }
.aw-runner-name { font-weight: 900; font-size: 16px; truncate: true; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aw-runner-meta { font-size: 11px; color: rgba(255,255,255,.45); font-weight: 700; text-transform: uppercase; letter-spacing:.08em; }
.aw-runner-value { font-weight: 900; font-size: 14px; color: rgba(255,255,255,.75); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  .aw-first, .aw-runner { transition: none; }
}
`;