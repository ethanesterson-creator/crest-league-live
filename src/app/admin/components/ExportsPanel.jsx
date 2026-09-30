// Presentational only -- state/handlers live in admin/page.js.
export default function ExportsPanel({ exporting, onExportStats, exportingCards, onExportCards }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-lg font-black">Export Player Stats (CSV)</div>
      <div className="mt-1 text-sm text-white/70">
        Downloads a CSV of every player across all leagues with their total stats (from <b>player_totals</b>).
      </div>

      <button
        disabled={exporting}
        onClick={onExportStats}
        className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10 disabled:opacity-60"
      >
        {exporting ? "Exporting…" : "Download Player Stats CSV"}
      </button>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="text-lg font-black">🃏 Player Card Data (for imaging team)</div>
        <div className="mt-1 text-sm text-white/70">
          The master keepsake file. One row per camper across <b>both sessions</b> — name, league, team, bunk, total wins, best single-game performance, and every stat total. This is what the imaging team turns into cards.
        </div>
        <button
          disabled={exportingCards}
          onClick={onExportCards}
          className="mt-4 w-full rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-black text-amber-100 hover:bg-amber-500/15 disabled:opacity-60"
        >
          {exportingCards ? "Building…" : "Download Player Card Data"}
        </button>
      </div>
    </div>
  );
}
