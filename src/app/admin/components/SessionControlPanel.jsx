// Presentational only -- state/handlers live in admin/page.js.
export default function SessionControlPanel({ cwSettings, sessionSwitchText, setSessionSwitchText, switchingSession, onStartSession2 }) {
  return (
    <div className="mt-8 bc-card bc-card-pad" style={{ "--accent": cwSettings?.current_session === "s2" ? "var(--accent)" : "var(--warn)" }}>
      <div className="bc-section-head"><h2>Session Control</h2></div>
      <div className="mt-1 text-sm text-white/60">
        Current session:{" "}
        <span className="font-black" style={{ color: "#8fb3ff" }}>
          {cwSettings?.current_session === "s2" ? "SESSION 2" : "SESSION 1"}
        </span>
      </div>

      {cwSettings?.current_session !== "s2" ? (
        <div className="mt-4 rounded-md border border-[var(--rule)] p-4">
          <div className="text-sm font-bold text-white/80">
            Start Session 2 — freezes all of Session 1 (kept forever, just hidden) and starts a fresh season with the new rosters. Standings, leaders, and games all reset to empty for Session 2. This also switches the app back to League mode.
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-sm">
              <div className="bc-select-label">Type START SESSION 2 to confirm</div>
              <input value={sessionSwitchText} onChange={(e) => setSessionSwitchText(e.target.value)}
                placeholder="START SESSION 2"
                className="w-full rounded-md border border-white/25 bg-slate-950 px-3 py-2 font-black tracking-wide text-white outline-none focus:border-white/25 sm:w-64" />
            </label>
            <button disabled={switchingSession} onClick={onStartSession2}
              className="rounded-md border px-5 py-2.5 text-sm font-black disabled:opacity-50" style={{ borderColor: "rgba(58,113,255,.4)", background: "var(--bc-accent-soft)", color: "#bcd4ff" }}>
              {switchingSession ? "Starting…" : "Start Session 2"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-md border bg-black/20 p-4 text-sm text-white/70" style={{ borderColor: "rgba(58,113,255,.2)" }}>
          Session 2 is live. Session 1 is frozen and preserved in the database. There is no switch back — Session 1 remains viewable via the archive (read-only).
        </div>
      )}
    </div>
  );
}
