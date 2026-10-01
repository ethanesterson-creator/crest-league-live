// Presentational only -- state/handlers live in admin/page.js.
export default function FinalGamesPanel({
  showFinalGames, setShowFinalGames,
  finalGames, loadingFinal, onRefresh,
  busy, onDelete,
  overrideGameId, setOverrideGameId,
  overridePoints, setOverridePoints,
  onSaveOverride,
  labelMatchup,
}) {
  return (
    <div className="mt-6 bc-card bc-card-pad">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="bc-section-head"><h2>Finalized Games</h2></div>
          <div className="mt-1 text-sm text-white/70">Admin-only delete. Rebuilds standings + leaders.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFinalGames((v) => !v)}
            className="rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10"
          >
            {showFinalGames ? "Hide" : `Show (${finalGames.length})`}
          </button>
          <button
            onClick={onRefresh}
            disabled={busy || loadingFinal}
            className="btn btn-secondary btn-sm"
          >
            {loadingFinal ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {showFinalGames ? (
      <>
      <div className="mt-3 text-xs text-white/60">
        Required confirmation word to delete: <b>DELETE</b>
      </div>

      {!finalGames.length ? (
        <div className="mt-4 text-sm text-white/60">{loadingFinal ? "Loading…" : "No finalized games found."}</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {finalGames.map((g) => (
            <div key={g.id} className="border-t border-[var(--rule)] py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-white/60">{new Date(g.created_at).toLocaleString()}</div>
                  <div className="mt-1 truncate text-lg font-black">{labelMatchup(g)}</div>
                  <div className="mt-1 text-sm text-white/70">
                    {g.league_key} • {g.sport} • Level {g.level} • {g.mode}{" "}
                    {g.is_staff_game ? (
                      <span className="ml-2 bc-chip">
                        STAFF
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-white/50">ID: {g.id}</div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-3">
                    <div className="py-2 text-center">
                      <div className="text-xs text-white/60">Final</div>
                      <div className="mt-1 text-3xl font-black tabular-nums">
                        {Number(g.score_a || 0)} - {Number(g.score_b || 0)}
                      </div>
                    </div>

                    <button
                      disabled={busy}
                      onClick={() => onDelete(g.id)}
                      className="rounded-md border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-500/15 disabled:opacity-60"
                    >
                      {busy ? "Working…" : "Delete Final Game"}
                    </button>
                  </div>

                  {overrideGameId === g.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={overridePoints}
                        onChange={(e) => setOverridePoints(e.target.value)}
                        placeholder="New win pts"
                        className="w-28 rounded-md border border-white/25 bg-white/5 px-3 py-2 text-sm font-black text-white outline-none"
                      />
                      <button
                        disabled={busy}
                        onClick={() => onSaveOverride(g.id)}
                        className="rounded-md border border-white/25 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/5 disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setOverrideGameId(null); setOverridePoints(""); }}
                        className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-black hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setOverrideGameId(g.id); setOverridePoints(""); }}
                      className="rounded-md border border-white/25 bg-white/5 px-3 py-2 text-xs font-black text-white hover:bg-white/5"
                    >
                      Override Win Points
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      ) : null}
    </div>
  );
}
