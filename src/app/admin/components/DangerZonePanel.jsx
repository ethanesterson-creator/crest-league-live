// Presentational only -- state/handlers live in admin/page.js.
export default function DangerZonePanel({ busy, onClearSnapshots, keepHighlights, setKeepHighlights, onResetSeason }) {
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <div className="bc-card bc-card-pad">
        <div className="bc-section-head"><h2>Clear Standings + Leaders</h2></div>
        <div className="mt-1 text-sm text-white/70">
          Empties snapshot tables. <b>Does not delete games.</b>
        </div>
        <div className="mt-4 text-xs text-white/60">
          Required confirmation word: <b>CLEAR</b>
        </div>

        <button
          disabled={busy}
          onClick={onClearSnapshots}
          className="btn btn-secondary mt-4 w-full"
        >
          {busy ? "Working…" : "Clear Snapshots"}
        </button>
      </div>

      <div className="rounded-md border p-5" style={{ borderColor: "rgba(220,38,38,.3)", background: "var(--bc-danger-soft)" }}>
        <div className="text-lg font-black text-red-100">Reset Season — Permanent Deletion</div>
        <div className="mt-1 text-sm text-red-200/80">
          Deletes <b>every game, stat, box score, and roster ever recorded</b> — not just test data. Once the season has started, this is irreversible. <b>Keeps leagues/players/points rules</b>.
        </div>

        <label className="mt-4 flex items-center gap-2.5 text-sm font-bold text-red-100">
          <input
            type="checkbox"
            checked={keepHighlights}
            onChange={(e) => setKeepHighlights(e.target.checked)}
            className="h-5 w-5"
            style={{ accentColor: "var(--bc-danger)" }}
          />
          Keep highlights (recommended)
        </label>

        <div className="mt-2 text-xs text-red-200/70">
          Required confirmation word: <b>RESET</b>
        </div>

        <button
          disabled={busy}
          onClick={onResetSeason}
          className="btn btn-danger mt-4 w-full"
        >
          {busy ? "Working…" : "RESET SEASON"}
        </button>
      </div>
    </div>
  );
}
