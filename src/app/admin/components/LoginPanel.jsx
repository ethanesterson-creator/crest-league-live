// Presentational only -- all state/handlers live in admin/page.js and are
// passed down as props, so behavior is identical to the inline JSX this
// was extracted from.
export default function LoginPanel({ pw, setPw, login }) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className="bc-card bc-card-pad" aria-labelledby="unlock-h">
        <div className="bc-section-head"><h2 id="unlock-h">Unlock admin</h2></div>
        <p className="text-[var(--ink-2)]">Enter the admin password to continue.</p>

        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => { e.preventDefault(); login(); }}
        >
          <label className="block">
            <span className="bc-select-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </label>
          <button type="submit" className="btn w-full">Unlock</button>
        </form>

        <p className="mt-3 text-sm text-[var(--ink-2)]">Contact Ethan Esterson if you need the password.</p>
      </section>

      {/* Install instructions — moved here from the old Install page */}
      <section className="bc-card bc-card-pad" aria-labelledby="install-h">
        <div className="bc-section-head"><h2 id="install-h">Install on your phone</h2></div>
        <p className="text-[var(--ink-2)]">Add the app to your home screen in about 20 seconds.</p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="font-bold">iPhone (Safari)</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--ink-2)]">
              <li>Open this site in <b>Safari</b>.</li>
              <li>Tap the <b>Share</b> button.</li>
              <li>Tap <b>Add to Home Screen</b>.</li>
              <li>Name it <b>Crest Live</b>, then tap <b>Add</b>.</li>
            </ol>
          </div>
          <div className="md:border-l md:border-[var(--rule)] md:pl-6">
            <h3 className="font-bold">Android (Chrome)</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--ink-2)]">
              <li>Open this site in <b>Chrome</b>.</li>
              <li>Tap the <b>3-dot menu</b>.</li>
              <li>Tap <b>Add to Home screen</b>.</li>
              <li>Confirm with <b>Add</b>.</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
