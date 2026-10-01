// Presentational only -- state/handlers live in admin/page.js.
export default function ArchivePanel({
  archiveOpen, onToggle,
  archiveLeague, onSelectLeague,
  archiveLoading, archiveStandings, archiveLeaders,
}) {
  return (
    <div className="mt-8 rounded-md border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="bc-section-head"><h2>Session 1 Archive</h2></div>
          <div className="mt-1 text-sm text-white/60">Read-only view of frozen Session 1 standings + stat leaders. Does not affect the current session.</div>
        </div>
        <button
          onClick={onToggle}
          className="rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/15">
          {archiveOpen ? "Hide" : "View Session 1"}
        </button>
      </div>

      {archiveOpen ? (
        <div className="mt-5">
          <div className="flex items-center gap-2">
            {["seniors", "juniors", "sophomores"].map((lg) => (
              <button key={lg}
                onClick={() => onSelectLeague(lg)}
                className={`rounded-md border px-3 py-2 text-sm font-black ${archiveLeague === lg ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/15 bg-white/5 hover:bg-white/10"}`}>
                {lg.charAt(0).toUpperCase() + lg.slice(1)}
              </button>
            ))}
          </div>

          {archiveLoading ? (
            <div className="mt-4 text-sm text-white/60">Loading…</div>
          ) : (
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <div className="border-t border-[var(--rule)] py-4">
                <div className="mb-2 text-sm font-black uppercase tracking-wider text-white/50">Final Standings</div>
                <table className="w-full text-left text-sm">
                  <thead className="text-white/50"><tr><th className="py-1">#</th><th>Team</th><th>W</th><th>L</th><th>Pts</th></tr></thead>
                  <tbody>
                    {archiveStandings.map((r, i) => (
                      <tr key={r.team_name} className="border-t border-white/10">
                        <td className="py-2 text-white/40">{i + 1}</td>
                        <td className="py-2 font-black">{r.team_name}</td>
                        <td className="py-2">{r.wins}</td>
                        <td className="py-2">{r.losses}</td>
                        <td className="py-2 font-black">{r.total}</td>
                      </tr>
                    ))}
                    {!archiveStandings.length ? <tr><td colSpan={5} className="py-3 text-white/50">No data.</td></tr> : null}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-[var(--rule)] py-4">
                <div className="mb-2 text-sm font-black uppercase tracking-wider text-white/50">Top Stat Leaders</div>
                <div className="grid gap-1">
                  {archiveLeaders.map((r, i) => (
                    <div key={i} className="flex items-center justify-between border-t border-white/10 py-1.5 text-sm">
                      <div className="truncate font-bold">{r.player_name}</div>
                      <div className="ml-3 shrink-0 text-white/60">{r.value} {String(r.stat_key).toUpperCase()} · {String(r.sport).toUpperCase()}</div>
                    </div>
                  ))}
                  {!archiveLeaders.length ? <div className="py-3 text-white/50">No data.</div> : null}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
