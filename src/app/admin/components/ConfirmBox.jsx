// Presentational only -- state lives in admin/page.js. This one input
// gates several unrelated destructive actions below by design (see
// requireConfirm's comment in page.js) -- it stays a single shared box.
export default function ConfirmBox({ value, onChange }) {
  return (
    <div className="mt-6 bc-card bc-card-pad">
      <div className="bc-section-head"><h2>Confirmation</h2></div>
      <div className="mt-1 text-sm text-white/70">Type the required word to enable a dangerous action.</div>

      <div className="mt-3">
        <div className="bc-select-label">Type here</div>
        <input
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white placeholder:text-white/30"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='Type "CLEAR", "RESET", "REBUILD", "DELETE", or "TRADE"'
        />
      </div>
    </div>
  );
}
