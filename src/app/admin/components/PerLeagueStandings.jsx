// Presentational only -- state/handlers live in admin/page.js.
export default function PerLeagueStandings({ league, setLeague, rows, loading, onRefresh }) {
  return (
    <div className="mt-6 bc-card bc-card-pad">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="bc-section-head"><h2>Per-League Standings</h2></div>
          <div className="mt-1 text-sm text-white/70">
            For group leaders. Includes non-game points. The public Standings page now shows camp-wide totals only.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className="bc-select w-auto"
          >
            <option value="seniors">Seniors</option>
            <option value="juniors">Juniors</option>
            <option value="sophomores">Sophomores</option>
          </select>
          <button
            onClick={onRefresh}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {loading ? (
          <div className="py-4 text-sm text-white/60">Loading…</div>
        ) : (
          <table className="bc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r, i) => (
                  <tr key={`${r.team_name}-${i}`}>
                    <td><span className={`bc-rank ${i === 0 ? "bc-rank-1" : ""}`}>{i + 1}</span></td>
                    <td className="font-extrabold">{r.team_name}</td>
                    <td>{r.wins}</td>
                    <td>{r.losses}</td>
                    <td className="font-black">{r.league_points}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-4 text-white/60" colSpan={5}>
                    No standings yet for this league.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
