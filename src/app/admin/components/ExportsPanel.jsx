// Presentational only -- state/handlers live in admin/page.js.
export default function ExportsPanel({ exporting, onExportStats, exportingCards, onExportCards }) {
  return (
    <div className="mt-6 bc-card bc-card-pad">
      <div className="bc-section-head"><h2>Export Player Stats (CSV)</h2></div>
      <div className="mt-1 text-sm text-white/70">
        Downloads a CSV of every player across all leagues with their total stats (from <b>player_totals</b>).
      </div>

      <button
        disabled={exporting}
        onClick={onExportStats}
        className="btn btn-secondary mt-4 w-full"
      >
        {exporting ? "Exporting…" : "Download Player Stats CSV"}
      </button>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="bc-section-head"><h2>Player card data (for imaging team)</h2></div>
        <div className="mt-1 text-sm text-white/70">
          The master keepsake file. One row per camper across <b>both sessions</b> — name, league, team, bunk, total wins, best single-game performance, and every stat total. This is what the imaging team turns into cards.
        </div>
        <button
          disabled={exportingCards}
          onClick={onExportCards}
          className="btn mt-4 w-full"
        >
          {exportingCards ? "Building…" : "Download Player Card Data"}
        </button>
      </div>
    </div>
  );
}
