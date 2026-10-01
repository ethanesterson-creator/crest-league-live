// Presentational only -- state/handlers live in admin/page.js.
export default function AwardsControlPanel({ cwSettings, onToggle }) {
  return (
    <div className="mt-8 bc-card bc-card-pad">
      <div className="bc-section-head"><h2>Awards</h2></div>
      <div className="mt-1 text-sm text-white/60">
        The Awards page shows live leaders during the session. When league play is over, mark it final to crown winners.
      </div>
      <button
        onClick={onToggle}
        className="mt-4 rounded-md border border-white/25 bg-white/5 px-5 py-2.5 text-sm font-black text-white hover:bg-white/5"
      >
        {cwSettings?.league_ended ? "Reopen (back to live race)" : "Mark league final (crown winners)"}
      </button>
    </div>
  );
}
