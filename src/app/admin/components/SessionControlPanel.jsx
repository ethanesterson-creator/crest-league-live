// Presentational only -- state/handlers live in admin/page.js.
export default function SessionControlPanel({ cwSettings, sessionSwitchText, setSessionSwitchText, switchingSession, onStartSession2 }) {
  return (
    <div
      className="mt-8 rounded-2xl border p-5"
      style={cwSettings?.current_session === "s2"
        ? { borderColor: "rgba(58,113,255,.5)", background: "var(--bc-accent-soft)" }
        : { borderColor: "rgba(245,196,81,.3)", background: "var(--bc-gold-soft)" }}
    >
      <div className="text-lg font-black">Session Control</div>
      <div className="mt-1 text-sm text-white/60">
        Current session:{" "}
        <span className="font-black" style={{ color: "#8fb3ff" }}>
          {cwSettings?.current_session === "s2" ? "SESSION 2" : "SESSION 1"}
        </span>
      </div>

      {cwSettings?.current_session !== "s2" ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-bold text-white/80">
            Start Session 2 — freezes all of Session 1 (kept forever, just hidden) and starts a fresh season with the new rosters. Standings, leaders, and games all reset to empty for Session 2. This also switches the app back to League mode.
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-sm">
              <div className="mb-1 text-xs font-bold text-white/60">Type START SESSION 2 to confirm</div>
              <input value={sessionSwitchText} onChange={(e) => setSessionSwitchText(e.target.value)}
                placeholder="START SESSION 2"
                className="w-full rounded-xl border border-amber-400/40 bg-slate-950 px-3 py-2 font-black tracking-wide text-white outline-none focus:border-amber-400/70 sm:w-64" />
            </label>
            <button disabled={switchingSession} onClick={onStartSession2}
              className="rounded-xl border px-5 py-2.5 text-sm font-black disabled:opacity-50" style={{ borderColor: "rgba(58,113,255,.4)", background: "var(--bc-accent-soft)", color: "#bcd4ff" }}>
              {switchingSession ? "Starting…" : "→ Start Session 2"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border bg-black/20 p-4 text-sm text-white/70" style={{ borderColor: "rgba(58,113,255,.2)" }}>
          Session 2 is live. Session 1 is frozen and preserved in the database. There is no switch back — Session 1 remains viewable via the archive (read-only).
        </div>
      )}
    </div>
  );
}
