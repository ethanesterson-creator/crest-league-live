"use client";

// ============================================================================
// This route REPLACES the old Install page. While Fantasy Crest is under
// construction, it shows a build placeholder. The real fantasy UI is scaffolded
// below and gated behind FANTASY_READY — flip that to true when it's done.
//
// Nothing here touches the live app. It only reads/writes the fantasy_* tables.
// ============================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppMode } from "@/lib/useAppMode";

const FANTASY_READY = false; // <-- flip to true when construction is complete

export default function FantasyPage() {
  if (!FANTASY_READY) return <UnderConstruction />;
  return <FantasyHome />;
}

// ---------------------------------------------------------------------------
// CONSTRUCTION PLACEHOLDER (what everyone sees for now)
// ---------------------------------------------------------------------------
function UnderConstruction() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center pb-12 text-center">
      <div className="text-7xl">🚧</div>
      <div className="mt-4 text-4xl font-black">Fantasy Crest</div>
      <div className="mt-2 max-w-md text-white/60">
        A fantasy league for counselors is under construction. Draft campers,
        earn points when they play and win, and compete all session long.
      </div>
      <div className="mt-6 rounded-full border border-amber-400/30 bg-amber-500/10 px-5 py-2 text-sm font-black uppercase tracking-widest text-amber-200">
        Coming soon
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FANTASY HOME (scaffold — standings + weekly leaders). Hidden until READY.
// ---------------------------------------------------------------------------
function FantasyHome() {
  const { session } = useAppMode();
  const [standings, setStandings] = useState([]);
  const [teams, setTeams] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: t } = await supabase
          .from("fantasy_teams")
          .select("id, team_name, owner_name")
          .eq("session", session);
        const tmap = {};
        for (const row of t || []) tmap[row.id] = row;
        setTeams(tmap);

        const { data: s } = await supabase
          .from("fantasy_standings")
          .select("fantasy_team_id, total_points")
          .eq("session", session)
          .order("total_points", { ascending: false });
        setStandings(s || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  return (
    <div className="pb-12">
      <div className="mt-6">
        <div className="text-3xl font-black">Fantasy Crest</div>
        <div className="mt-1 text-white/60">Counselor fantasy standings.</div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-black">Standings</div>
        {loading ? (
          <div className="mt-3 text-sm text-white/60">Loading…</div>
        ) : !standings.length ? (
          <div className="mt-3 text-sm text-white/60">No fantasy teams yet.</div>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-white/50">
              <tr>
                <th className="py-1">#</th>
                <th>Team</th>
                <th>Owner</th>
                <th className="text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => {
                const team = teams[row.fantasy_team_id] || {};
                return (
                  <tr key={row.fantasy_team_id} className="border-t border-white/10">
                    <td className="py-2 text-white/40">{i + 1}</td>
                    <td className="py-2 font-black">{team.team_name || "—"}</td>
                    <td className="py-2 text-white/70">{team.owner_name || "—"}</td>
                    <td className="py-2 text-right font-black tabular-nums">
                      {Number(row.total_points || 0).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}