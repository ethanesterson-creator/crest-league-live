// Presentational only -- state/handlers live in admin/page.js.
export default function RebuildPanel({ busy, onRebuild }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-lg font-black">Rebuild Leaderboards</div>
      <div className="mt-1 text-sm text-white/70">Recalculates standings + stat leaders from all finalized games.</div>
      <div className="mt-3 text-xs text-white/60">
        Required confirmation word: <b>REBUILD</b>
      </div>

      <button
        disabled={busy}
        onClick={onRebuild}
        className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10 disabled:opacity-60"
      >
        {busy ? "Working…" : "Rebuild Leaderboards"}
      </button>
    </div>
  );
}
