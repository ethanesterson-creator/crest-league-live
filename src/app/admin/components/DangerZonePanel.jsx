// Presentational only -- state/handlers live in admin/page.js.
export default function DangerZonePanel({ busy, onClearSnapshots, keepHighlights, setKeepHighlights, onResetSeason }) {
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-black">Clear Standings + Leaders</div>
        <div className="mt-1 text-sm text-white/70">
          Empties snapshot tables. <b>Does not delete games.</b>
        </div>
        <div className="mt-4 text-xs text-white/60">
          Required confirmation word: <b>CLEAR</b>
        </div>

        <button
          disabled={busy}
          onClick={onClearSnapshots}
          className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10 disabled:opacity-60"
        >
          {busy ? "Working…" : "Clear Snapshots"}
        </button>
      </div>

      <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(220,38,38,.3)", background: "var(--bc-danger-soft)" }}>
        <div className="text-lg font-black text-red-100">⚠️ Reset Season — Permanent Deletion</div>
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
          className="mt-4 w-full rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-500/15 disabled:opacity-60"
        >
          {busy ? "Working…" : "RESET SEASON"}
        </button>
      </div>
    </div>
  );
}
