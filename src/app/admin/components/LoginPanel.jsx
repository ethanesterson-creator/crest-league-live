// Presentational only -- all state/handlers live in admin/page.js and are
// passed down as props, so behavior is identical to the inline JSX this
// was extracted from.
export default function LoginPanel({ pw, setPw, login }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-lg font-black">Unlock Admin</div>
      <div className="mt-1 text-sm text-white/70">Enter the admin password</div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="mb-1 text-xs font-bold text-white/60">Password</div>
          <input
            type="password"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white placeholder:text-white/30"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <button onClick={login} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 hover:bg-white/90">
          Unlock
        </button>
      </div>

      <div className="mt-3 text-xs text-white/50">Contact Ethan Esterson If Password Needed</div>

      {/* Install instructions — moved here from the old Install page */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="text-lg font-black">📲 Install Crest League Live</div>
        <div className="mt-1 text-sm text-white/60">Add the app to your home screen in 20 seconds.</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="font-black">iPhone (Safari)</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/75">
              <li>Open this site in <b>Safari</b>.</li>
              <li>Tap the <b>Share</b> button.</li>
              <li>Tap <b>Add to Home Screen</b>.</li>
              <li>Name it <b>Crest Live</b>, then <b>Add</b>.</li>
            </ol>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="font-black">Android (Chrome)</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/75">
              <li>Open this site in <b>Chrome</b>.</li>
              <li>Tap the <b>3-dot menu</b>.</li>
              <li>Tap <b>Add to Home screen</b>.</li>
              <li>Confirm <b>Add</b>.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
