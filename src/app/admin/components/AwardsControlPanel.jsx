// Presentational only -- state/handlers live in admin/page.js.
export default function AwardsControlPanel({ cwSettings, onToggle }) {
  return (
    <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
      <div className="text-lg font-black">🏆 Awards</div>
      <div className="mt-1 text-sm text-white/60">
        The Awards page shows live leaders during the session. When league play is over, mark it final to crown winners.
      </div>
      <button
        onClick={onToggle}
        className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/15 px-5 py-2.5 text-sm font-black text-amber-100 hover:bg-amber-500/25"
      >
        {cwSettings?.league_ended ? "↩ Reopen (back to live race)" : "🏆 Mark league final (crown winners)"}
      </button>
    </div>
  );
}
