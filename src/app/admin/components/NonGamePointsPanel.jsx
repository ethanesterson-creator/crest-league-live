// Presentational only -- state/handlers live in admin/page.js.
export default function NonGamePointsPanel({ ngRows, loadingNG, onRefresh, busy, onDelete }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-black">Non-Game Points Entries</div>
          <div className="mt-1 text-sm text-white/70">Soft-delete entries (removes from totals immediately).</div>
        </div>

        <button
          onClick={onRefresh}
          disabled={busy || loadingNG}
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10 disabled:opacity-60"
        >
          {loadingNG ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="mt-3 text-xs text-white/60">
        Required confirmation word to delete: <b>DELETE</b>
      </div>

      {!ngRows.length ? (
        <div className="mt-4 text-sm text-white/60">{loadingNG ? "Loading…" : "No non-game entries found."}</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {ngRows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-white/60">
                    {r.entry_date} • {r.league_id}
                  </div>
                  <div className="mt-1 truncate text-lg font-black">
                    {r.team_name} +{Number(r.points || 0)}
                  </div>
                  <div className="mt-1 text-sm text-white/70">{r.reason}</div>
                  {r.notes ? <div className="mt-1 text-xs text-white/60">{r.notes}</div> : null}
                  <div className="mt-1 text-xs text-white/40">ID: {r.id}</div>
                </div>

                <button
                  disabled={busy}
                  onClick={() => onDelete(r.id)}
                  className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-500/15 disabled:opacity-60"
                >
                  {busy ? "Working…" : "Delete Entry"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
