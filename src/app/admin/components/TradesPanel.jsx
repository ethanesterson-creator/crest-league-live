// Presentational only -- state/handlers live in admin/page.js.
export default function TradesPanel({
  loadingTradeMeta, onRefresh,
  tradeLeague, setTradeLeague, leagueOptions,
  tradeFromTeam, setTradeFromTeam,
  tradeToTeam, setTradeToTeam,
  teamOptions,
  tradeSearch, setTradeSearch,
  filteredFromPlayers,
  busy, onTrade,
}) {
  return (
    <div className="mt-6 bc-card bc-card-pad">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="bc-section-head"><h2>Trades</h2></div>
          <div className="mt-1 text-sm text-white/70">
            Trade players <b>within the same age league</b>. This only changes which team they appear on for{" "}
            <b>future rosters</b>.
          </div>
          <div className="mt-2 text-xs text-white/60">
            Required confirmation word: <b>TRADE</b>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={busy || loadingTradeMeta}
          className="btn btn-secondary btn-sm"
        >
          {loadingTradeMeta ? "Loading…" : "Refresh Lists"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <div className="bc-select-label">League</div>
          <select
            value={tradeLeague}
            onChange={(e) => setTradeLeague(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
          >
            <option value="">Select league…</option>
            {leagueOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="bc-select-label">From Team</div>
          <select
            value={tradeFromTeam}
            onChange={(e) => setTradeFromTeam(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
          >
            <option value="">Select team…</option>
            {teamOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="bc-select-label">To Team</div>
          <select
            value={tradeToTeam}
            onChange={(e) => setTradeToTeam(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
          >
            <option value="">Select team…</option>
            {teamOptions
              .filter((t) => t !== tradeFromTeam)
              .map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <div className="bc-select-label">Search Players (name/id/role)</div>
        <input
          value={tradeSearch}
          onChange={(e) => setTradeSearch(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white placeholder:text-white/30"
        />
      </div>

      {!tradeLeague || !tradeFromTeam ? (
        <div className="mt-4 text-sm text-white/60">Choose a League and From Team to load players.</div>
      ) : !filteredFromPlayers.length ? (
        <div className="mt-4 text-sm text-white/60">No players found on that team.</div>
      ) : (
        <div className="mt-4 grid gap-2">
          {filteredFromPlayers.map((p) => {
            const full =
              `${String(p.first_name ?? "").trim()} ${String(p.last_name ?? "").trim()}`.trim() || String(p.id);
            const role = String(p.role ?? "");
            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--rule)] p-4">
                <div className="min-w-0">
                  <div className="truncate text-base font-black">{full}</div>
                  <div className="mt-1 text-xs text-white/60">
                    {p.league_id} • {p.team_name} • ID: {p.id}
                    {role ? <span className="ml-2 text-white/50">• Role: {role}</span> : null}
                  </div>
                </div>

                <button
                  disabled={busy || !tradeToTeam || tradeToTeam === tradeFromTeam}
                  onClick={() => onTrade(p)}
                  className="rounded-md border border-white/25 bg-white/5 px-4 py-3 text-sm font-black text-white hover:bg-white/5 disabled:opacity-60"
                  title="Trade player"
                >
                  Trade → {tradeToTeam || "Select TO team"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
