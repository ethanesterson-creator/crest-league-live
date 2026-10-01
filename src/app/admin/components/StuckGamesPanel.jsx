// Presentational only -- state/handlers live in admin/page.js.
export default function StuckGamesPanel({ stuckGames, onLoad, busy, onForceClose, labelMatchup }) {
  return (
    <div className="mt-6 bc-card bc-card-pad" style={{ "--accent": "var(--warn)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-black text-amber-100">Stuck Games</div>
          <div className="mt-1 text-sm text-amber-200/70">
            Games stuck in "active" status that were never finalized. Safe to remove if the game never finished.
          </div>
        </div>
        <button
          onClick={onLoad}
          className="shrink-0 rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/20"
        >
          Load
        </button>
      </div>

      <div className="mt-3 text-xs text-white/60">
        Required confirmation word: <span className="font-black text-white">DELETE</span>
      </div>

      {stuckGames.length === 0 ? (
        <div className="mt-4 text-sm text-white/60">
          No stuck games found. Hit Load to check.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {stuckGames.map((g) => (
            <div key={g.id} className="border-t border-[var(--rule)] py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-white/60">{new Date(g.created_at).toLocaleString()}</div>
                  <div className="mt-1 truncate text-lg font-black">{labelMatchup(g)}</div>
                  <div className="mt-1 text-sm text-white/70">
                    {g.league_key} • {g.sport} • Level {g.level}
                  </div>
                  <div className="mt-1 text-xl font-black tabular-nums">
                    {Number(g.score_a || 0)} – {Number(g.score_b || 0)}
                  </div>
                  <div className="mt-1 text-xs text-white/50">ID: {g.id}</div>
                </div>
                <button
                  onClick={() => onForceClose(g.id)}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-200 hover:bg-red-500/20 disabled:opacity-40"
                >
                  Force Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
