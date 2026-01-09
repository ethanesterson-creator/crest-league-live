export default function InstallPage() {
  return (
    <div className="pb-12">
      <div className="mt-6">
        <div className="text-3xl font-black">Install Crest League Live</div>
        <div className="mt-1 text-white/70">
          No App Store. Install from your browser in 20 seconds.
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xl font-black">iPhone (Safari)</div>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-white/80">
            <li>Open this site in <b>Safari</b> (not Google app).</li>
            <li>Tap the <b>Share</b> button (square with arrow).</li>
            <li>Scroll and tap <b>Add to Home Screen</b>.</li>
            <li>Name it <b>Crest Live</b> → tap <b>Add</b>.</li>
            <li>Open it from your Home Screen like a real app.</li>
          </ol>
          <div className="mt-4 text-xs text-white/50">
            Tip: After installing, use the Home Screen icon (it opens fullscreen).
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xl font-black">Android (Chrome)</div>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-white/80">
            <li>Open this site in <b>Chrome</b>.</li>
            <li>Tap the <b>3-dot menu</b> (top right).</li>
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
            <li>Open it from your Home Screen like a real app.</li>
          </ol>
          <div className="mt-4 text-xs text-white/50">
            If you don’t see “Install”, use “Add to Home screen”.
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-6">
        <div className="text-lg font-black text-emerald-100">Staff Rule</div>
        <div className="mt-1 text-white/80">
          Use the installed app icon during games. It’s faster and stays fullscreen.
        </div>
      </div>
    </div>
  );
}
