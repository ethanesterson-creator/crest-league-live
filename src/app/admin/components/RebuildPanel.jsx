// Presentational only -- state/handlers live in admin/page.js.
export default function RebuildPanel({ busy, onRebuild }) {
  return (
    <div className="mt-6 bc-card bc-card-pad">
      <div className="bc-section-head"><h2>Rebuild Leaderboards</h2></div>
      <div className="mt-1 text-sm text-white/70">Recalculates standings + stat leaders from all finalized games.</div>
      <div className="mt-3 text-xs text-white/60">
        Required confirmation word: <b>REBUILD</b>
      </div>

      <button
        disabled={busy}
        onClick={onRebuild}
        className="btn btn-secondary mt-4 w-full"
      >
        {busy ? "Working…" : "Rebuild Leaderboards"}
      </button>
    </div>
  );
}
