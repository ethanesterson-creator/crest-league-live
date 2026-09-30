// Presentational only -- state/handlers live in admin/page.js.
export default function ColorWarControlPanel({
  cwSettings,
  cwBlueNameInput, setCwBlueNameInput,
  cwWhiteNameInput, setCwWhiteNameInput,
  onSaveNames,
  modeSwitchText, setModeSwitchText,
  switchingMode, onSwitchMode,
}) {
  return (
    <div className={`mt-8 rounded-2xl border p-5 ${cwSettings?.mode === "color_war" ? "border-blue-400/50 bg-blue-500/10" : "border-white/10 bg-white/5"}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-black">Color War Control</div>
          <div className="mt-1 text-sm text-white/60">
            Current mode:{" "}
            <span className={cwSettings?.mode === "color_war" ? "font-black text-blue-300" : "font-black text-emerald-300"}>
              {cwSettings?.mode === "color_war" ? "COLOR WAR" : "LEAGUE"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <div className="mb-1 text-xs font-bold text-white/60">Blue Team Name</div>
          <input value={cwBlueNameInput} onChange={(e) => setCwBlueNameInput(e.target.value)}
            placeholder="Blue Avalanche"
            className="w-full rounded-xl border border-blue-400/30 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-400/60" />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-xs font-bold text-white/60">White Team Name</div>
          <input value={cwWhiteNameInput} onChange={(e) => setCwWhiteNameInput(e.target.value)}
            placeholder="White Knockout"
            className="w-full rounded-xl border border-white/30 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white/60" />
        </label>
      </div>
      <button onClick={onSaveNames}
        className="mt-3 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/15">
        Save Team Names
      </button>

      <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm font-bold text-white/80">
          {cwSettings?.mode === "color_war"
            ? "Switch back to LEAGUE — restores all league teams, standings, and stats exactly as they were. Color War data is kept."
            : "Switch to COLOR WAR — the whole app shows Blue vs White for the week. League data is untouched and returns when you switch back."}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="text-sm">
            <div className="mb-1 text-xs font-bold text-white/60">Type SWITCH to confirm</div>
            <input value={modeSwitchText} onChange={(e) => setModeSwitchText(e.target.value)}
              placeholder="SWITCH"
              className="w-full rounded-xl border border-amber-400/40 bg-slate-950 px-3 py-2 font-black tracking-widest text-white outline-none focus:border-amber-400/70 sm:w-48" />
          </label>
          {cwSettings?.mode === "color_war" ? (
            <button disabled={switchingMode} onClick={() => onSwitchMode("league")}
              className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-5 py-2.5 text-sm font-black text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50">
              {switchingMode ? "Switching…" : "→ Switch to LEAGUE"}
            </button>
          ) : (
            <button disabled={switchingMode} onClick={() => onSwitchMode("color_war")}
              className="rounded-xl border border-blue-400/40 bg-blue-500/15 px-5 py-2.5 text-sm font-black text-blue-100 hover:bg-blue-500/25 disabled:opacity-50">
              {switchingMode ? "Switching…" : "→ Switch to COLOR WAR"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
