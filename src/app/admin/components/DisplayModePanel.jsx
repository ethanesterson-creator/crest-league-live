// Presentational only -- state/handlers live in admin/page.js.
//
// Controls the TV/projector board's scene set (src/app/display/page.js),
// which used to be pinned by a hardcoded `const BANQUET = true` in source —
// meaning flipping it required a code change + redeploy, and it was left on
// permanently. Now it's one click here, same as the Color War switch below.
export default function DisplayModePanel({ cwSettings, onSwitch, switching }) {
  const mode = cwSettings?.display_mode || "season";
  return (
    <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
      <div className="text-lg font-black">📺 Display Board</div>
      <div className="mt-1 text-sm text-white/60">
        Controls what the TV/projector board at /display shows. Season mode
        is the normal in-season rotation — live scores, camp standings,
        per-game leaders. Banquet mode switches to the end-of-summer
        rotation — league champions, season recap, final awards, camper
        spotlight, highlights.
      </div>
      <div className="mt-3 text-sm font-bold text-white/80">
        Current:{" "}
        <span className={mode === "banquet" ? "text-amber-300" : "text-emerald-300"}>
          {mode === "banquet" ? "BANQUET" : "SEASON"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          disabled={switching || mode === "season"}
          onClick={() => onSwitch("season")}
          className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-black text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40"
        >
          Season Mode
        </button>
        <button
          disabled={switching || mode === "banquet"}
          onClick={() => onSwitch("banquet")}
          className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-black text-amber-100 hover:bg-amber-500/25 disabled:opacity-40"
        >
          🏆 Banquet Mode
        </button>
      </div>
    </div>
  );
}
