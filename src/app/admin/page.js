"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");

  const [confirmText, setConfirmText] = useState("");
  const [keepHighlights, setKeepHighlights] = useState(true);

  const [finalGames, setFinalGames] = useState([]);
  const [loadingFinal, setLoadingFinal] = useState(false);

  // non-game points list
  const [ngRows, setNgRows] = useState([]);
  const [loadingNG, setLoadingNG] = useState(false);

  // export
  const [exporting, setExporting] = useState(false);
  const [stuckGames, setStuckGames] = useState([]);
  const [overrideGameId, setOverrideGameId] = useState(null);
  const [overridePoints, setOverridePoints] = useState("");

  // ----------------------------
  // TRADES (within league only)
  // ----------------------------
  const [loadingTradeMeta, setLoadingTradeMeta] = useState(false);
  const [tradeLeague, setTradeLeague] = useState("");
  const [tradeFromTeam, setTradeFromTeam] = useState("");
  const [tradeToTeam, setTradeToTeam] = useState("");
  const [tradeSearch, setTradeSearch] = useState("");

  const [leagueOptions, setLeagueOptions] = useState([]); // [{league_id}]
  const [teamOptions, setTeamOptions] = useState([]); // ["red","blue"...]
  const [fromPlayers, setFromPlayers] = useState([]); // players on from team

  const adminPw = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "";

  useEffect(() => {
    if (!adminPw) {
      setErr("Admin password is not set. Add NEXT_PUBLIC_ADMIN_PASSWORD to .env.local and redeploy.");
    }
  }, [adminPw]);

  function resetMessages() {
    setErr("");
    setMsg("");
  }

  function requireConfirm(word) {
    return confirmText.trim().toUpperCase() === word;
  }

  function norm(s) {
    return String(s ?? "").trim();
  }

  function normLower(s) {
    return String(s ?? "").trim().toLowerCase();
  }

  async function loadFinalGames() {
    setLoadingFinal(true);
    try {
      const { data, error } = await supabase
        .from("live_games")
        .select(
          "id, created_at, league_key, sport, level, mode, matchup_type, team_a1, team_a2, team_b1, team_b2, score_a, score_b, status, is_staff_game"
        )
        .eq("status", "final")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setFinalGames(data || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoadingFinal(false);
    }
  }

  async function loadNonGamePoints() {
    setLoadingNG(true);
    try {
      const { data, error } = await supabase
        .from("non_game_points")
        .select("id, created_at, entry_date, league_id, team_name, points, reason, notes, status, deleted")
        .eq("deleted", false)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setNgRows(data || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoadingNG(false);
    }
  }

  // -------- TRADES HELPERS --------

  async function loadTradeMeta() {
    setLoadingTradeMeta(true);
    try {
      // Distinct league_id values from players
      const { data: leagues, error: lErr } = await supabase
        .from("players")
        .select("league_id")
        .order("league_id", { ascending: true });

      if (lErr) throw lErr;

      const uniqLeagues = Array.from(new Set((leagues || []).map((r) => norm(r.league_id)).filter(Boolean)));
      setLeagueOptions(uniqLeagues);

      // Default league selection if empty
      if (!tradeLeague && uniqLeagues.length) {
        setTradeLeague(uniqLeagues[0]);
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoadingTradeMeta(false);
    }
  }

  async function loadTeamsForLeague(leagueId) {
    if (!leagueId) {
      setTeamOptions([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("players")
        .select("team_name")
        .eq("league_id", leagueId)
        .order("team_name", { ascending: true });

      if (error) throw error;

      const uniqTeams = Array.from(new Set((data || []).map((r) => norm(r.team_name)).filter(Boolean)));
      setTeamOptions(uniqTeams);

      // keep selections valid
      if (tradeFromTeam && !uniqTeams.includes(tradeFromTeam)) setTradeFromTeam("");
      if (tradeToTeam && !uniqTeams.includes(tradeToTeam)) setTradeToTeam("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function loadPlayersForFromTeam(leagueId, fromTeam) {
    if (!leagueId || !fromTeam) {
      setFromPlayers([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("players")
        .select("id, first_name, last_name, team_name, league_id, role")
        .eq("league_id", leagueId)
        .eq("team_name", fromTeam)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .limit(5000);

      if (error) throw error;
      setFromPlayers(data || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function playerInActiveLiveGame(playerId) {
    // “Active” = live_games.status = 'live'
    const { data: liveIds, error: lErr } = await supabase
      .from("live_games")
      .select("id")
      .eq("status", "live")
      .limit(500);

    if (lErr) throw lErr;

    const ids = (liveIds || []).map((r) => r.id);
    if (!ids.length) return false;

    // Is player on any roster for those games?
    const { data: rosterHit, error: rErr } = await supabase
      .from("game_roster")
      .select("game_id, player_id")
      .eq("player_id", String(playerId))
      .in("game_id", ids)
      .limit(1);

    if (rErr) throw rErr;
    return !!(rosterHit && rosterHit.length);
  }

  async function doTradePlayer(player) {
    resetMessages();

    if (!requireConfirm("TRADE")) {
      setErr('Type "TRADE" in the confirmation box to run a trade.');
      return;
    }

    if (!tradeLeague || !tradeFromTeam || !tradeToTeam) {
      setErr("Choose league, FROM team, and TO team.");
      return;
    }
    if (tradeFromTeam === tradeToTeam) {
      setErr("FROM team and TO team must be different.");
      return;
    }

    const fullName =
      `${String(player.first_name ?? "").trim()} ${String(player.last_name ?? "").trim()}`.trim() || String(player.id);

    const ok = confirm(
      `Trade this player?\n\n${fullName}\n${tradeLeague}: ${tradeFromTeam} → ${tradeToTeam}\n\nThis only affects FUTURE rosters. Past games stay unchanged.`
    );
    if (!ok) return;

    setBusy(true);
    try {
      // Safety: block if player is in an active live game roster
      const inLive = await playerInActiveLiveGame(player.id);
      if (inLive) {
        setErr("This player is currently in an active live game roster. End that game (or delete it) before trading.");
        return;
      }

      // Trade = update players.team_name (within same league only)
      const { data: updated, error } = await supabase
        .from("players")
        .update({ team_name: tradeToTeam })
        .eq("id", player.id)
        .eq("league_id", tradeLeague)
        .eq("team_name", tradeFromTeam)
        .select("id, first_name, last_name, league_id, team_name, role")
        .single();

      if (error) throw error;

      setMsg(`✅ Traded ${fullName}: ${tradeFromTeam} → ${tradeToTeam} (${updated.league_id}).`);
      setConfirmText("");

      // refresh list so they disappear from FROM team
      await loadPlayersForFromTeam(tradeLeague, tradeFromTeam);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- auth + initial loads ----

  useEffect(() => {
    if (!authed) return;
    loadFinalGames();
    loadNonGamePoints();
    loadTradeMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    if (!tradeLeague) return;
    loadTeamsForLeague(tradeLeague);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeLeague, authed]);

  useEffect(() => {
    if (!authed) return;
    loadPlayersForFromTeam(tradeLeague, tradeFromTeam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeLeague, tradeFromTeam, authed]);

  const filteredFromPlayers = useMemo(() => {
    const q = normLower(tradeSearch);
    if (!q) return fromPlayers;

    return (fromPlayers || []).filter((p) => {
      const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const id = String(p.id ?? "").toLowerCase();
      const role = String(p.role ?? "").toLowerCase();
      return full.includes(q) || id.includes(q) || role.includes(q);
    });
  }, [fromPlayers, tradeSearch]);
  async function loadStuckGames() {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("live_games")
        .select("*")
        .eq("status", "active")
        .is("played_on", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStuckGames(data || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function forceCloseGame(gid) {
    resetMessages();
    if (!requireConfirm("DELETE")) {
      setErr('Type "DELETE" in the confirmation box to force-close a stuck game.');
      return;
    }

    const ok = confirm(
      "Force-close this stuck game?\n\nThis will delete it WITHOUT updating standings or stat leaders.\nUse this only for games that never finished and have no valid score."
    );
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("delete_unfinalized_game", { gid });
      if (error) throw error;
      setMsg("✅ Stuck game removed.");
      setConfirmText("");
      await loadStuckGames();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }
  async function updateGameWinPoints(gid) {
    resetMessages();
    if (!requireConfirm("REBUILD")) {
      setErr('Type "REBUILD" in the confirmation box to override win points.');
      return;
    }

    const pts = Number(overridePoints);
    if (!pts || pts < 0) {
      setErr("Enter a valid points value greater than 0.");
      return;
    }

    setBusy(true);
    try {
      // Update the win_points on the game record
      const { error: updateErr } = await supabase
        .from("live_games")
        .update({ win_points_override: pts })
        .eq("id", gid);

      if (updateErr) throw updateErr;

      // Rebuild standings so the new value takes effect
      const { error: rebuildErr } = await supabase.rpc("rebuild_leaderboards");
      if (rebuildErr) throw rebuildErr;

      setMsg(`✅ Win points updated to ${pts} and standings rebuilt.`);
      setOverrideGameId(null);
      setOverridePoints("");
      setConfirmText("");
      await loadFinalGames();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }
  async function doClearSnapshots() {
    resetMessages();

    if (!requireConfirm("CLEAR")) {
      setErr('Type "CLEAR" in the confirmation box to run this.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_clear_snapshots");
      if (error) throw error;

      setMsg("✅ Cleared standings + stat leaders. (Games remain untouched.)");
      setConfirmText("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doResetSeason() {
    resetMessages();

    if (!requireConfirm("RESET")) {
      setErr('Type "RESET" in the confirmation box to run this.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_reset_season", {
        p_keep_highlights: keepHighlights,
      });
      if (error) throw error;

      setMsg(`✅ Season reset complete. (Highlights ${keepHighlights ? "kept" : "cleared"}.)`);
      setConfirmText("");
      setFinalGames([]);
      setNgRows([]);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doRebuildLeaderboards() {
    resetMessages();

    if (!requireConfirm("REBUILD")) {
      setErr('Type "REBUILD" in the confirmation box to run this.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.rpc("rebuild_leaderboards");
      if (error) throw error;

      setMsg("✅ Rebuilt standings + stat leaders from finalized games.");
      setConfirmText("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteFinalGame(gid) {
    resetMessages();

    if (!requireConfirm("DELETE")) {
      setErr('Type "DELETE" in the confirmation box to delete a finalized game.');
      return;
    }

    const ok = confirm(
      "Delete this FINALIZED game?\n\nThis will remove the game + events + roster, then rebuild standings + stat leaders.\n\nThis cannot be undone."
    );
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_delete_finalized_game", { gid });
      if (error) throw error;

      setMsg("✅ Finalized game deleted. Standings + stat leaders rebuilt.");
      setConfirmText("");
      await loadFinalGames();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteNonGame(id) {
    resetMessages();

    if (!requireConfirm("DELETE")) {
      setErr('Type "DELETE" in the confirmation box to delete a non-game entry.');
      return;
    }

    const ok = confirm("Delete this Non-Game Points entry?\n\nThis will remove it from totals immediately.");
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase
        .from("non_game_points")
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      setMsg("✅ Non-game points entry deleted.");
      setConfirmText("");
      await loadNonGamePoints();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function login() {
    resetMessages();

    if (!adminPw) return;
    if (pw === adminPw) {
      setAuthed(true);
      setPw("");
      setMsg("✅ Admin unlocked.");
    } else {
      setErr("Incorrect password.");
    }
  }

  function labelMatchup(g) {
    if (g.matchup_type === "two_team") {
      const left = [g.team_a1, g.team_a2].filter(Boolean).join(" + ");
      const right = [g.team_b1, g.team_b2].filter(Boolean).join(" + ");
      return `${left} vs ${right}`;
    }
    return `${g.team_a1} vs ${g.team_b1}`;
  }

  // ----------------------------
  // CSV EXPORT (WIDE FORMAT)
  // ----------------------------

  function csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPlayerStatsCSV() {
    resetMessages();
    setExporting(true);

    try {
      setMsg("Building CSV...");

      const norm2 = (s) => String(s ?? "").trim().toLowerCase();

      // 1) Players (source of truth for names/teams)
      const { data: players, error: pErr } = await supabase
        .from("players")
        .select("id, league_id, team_name, first_name, last_name")
        .order("league_id", { ascending: true })
        .order("team_name", { ascending: true })
        .order("last_name", { ascending: true });

      if (pErr) throw pErr;

      // 2) Rules: stat keys per sport (to build columns even if empty)
      const { data: rules, error: rErr } = await supabase.from("points_rules").select("league_id, sport, stat_keys");
      if (rErr) throw rErr;

      // 3) Totals: actual values
      const { data: totals, error: tErr } = await supabase
        .from("player_totals")
        .select("league_id, sport, player_id, stat_key, value");
      if (tErr) throw tErr;

      const statColSet = new Set();

      for (const rr of rules || []) {
        const sport = norm2(rr.sport);
        const keys = String(rr.stat_keys ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

        for (const k of keys) statColSet.add(`${sport}_${norm2(k)}`);
      }

      for (const tt of totals || []) {
        statColSet.add(`${norm2(tt.sport)}_${norm2(tt.stat_key)}`);
      }

      const statCols = Array.from(statColSet).sort();

      const totalsMap = new Map();
      for (const t of totals || []) {
        const key = `${norm2(t.league_id)}|${String(t.player_id)}|${norm2(t.sport)}|${norm2(t.stat_key)}`;
        totalsMap.set(key, Number(t.value || 0));
      }

      const header = ["league_id", "team_name", "player_id", "player_name", ...statCols];

      const lines = [];
      lines.push(header.join(","));

      for (const p of players || []) {
        const league = norm2(p.league_id);
        const playerId = String(p.id);

        const playerName =
          `${String(p.first_name ?? "").trim()} ${String(p.last_name ?? "").trim()}`.trim() || playerId;

        const row = {};
        row.league_id = league;
        row.team_name = String(p.team_name ?? "");
        row.player_id = playerId;
        row.player_name = playerName;

        for (const col of statCols) row[col] = 0;

        for (const col of statCols) {
          const [sport, stat] = col.split("_");
          const k = `${league}|${playerId}|${sport}|${stat}`;
          if (totalsMap.has(k)) row[col] = totalsMap.get(k);
        }

        lines.push(header.map((h) => csvEscape(row[h])).join(","));
      }

      const csv = lines.join("\n");
      downloadTextFile(`crest_player_stats_${new Date().toISOString().slice(0, 10)}.csv`, csv);

      setMsg("✅ CSV downloaded.");
    } catch (e) {
      setErr(e?.message ?? String(e));
      setMsg("");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="pb-10">
      <div className="mt-6">
        <div className="text-2xl font-black">Admin Tools</div>
        <div className="text-sm text-white/70">Used For Deleting Games and Fixing Snapshots.</div>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div>
      ) : null}
      {msg ? (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {msg}
        </div>
      ) : null}

      {!authed ? (
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
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-black">Confirmation</div>
            <div className="mt-1 text-sm text-white/70">Type the required word to enable a dangerous action.</div>

            <div className="mt-3">
              <div className="mb-1 text-xs font-bold text-white/60">Type here</div>
              <input
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white placeholder:text-white/30"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "CLEAR", "RESET", "REBUILD", "DELETE", or "TRADE"'
              />
            </div>
          </div>

          {/* Trades */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black">Trades</div>
                <div className="mt-1 text-sm text-white/70">
                  Trade players <b>within the same age league</b>. This only changes which team they appear on for{" "}
                  <b>future rosters</b>.
                </div>
                <div className="mt-2 text-xs text-white/60">
                  Required confirmation word: <b>TRADE</b>
                </div>
              </div>

              <button
                onClick={loadTradeMeta}
                disabled={busy || loadingTradeMeta}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10 disabled:opacity-60"
              >
                {loadingTradeMeta ? "Loading…" : "Refresh Lists"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <div className="mb-1 text-xs font-bold text-white/60">League</div>
                <select
                  value={tradeLeague}
                  onChange={(e) => setTradeLeague(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
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
                <div className="mb-1 text-xs font-bold text-white/60">From Team</div>
                <select
                  value={tradeFromTeam}
                  onChange={(e) => setTradeFromTeam(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
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
                <div className="mb-1 text-xs font-bold text-white/60">To Team</div>
                <select
                  value={tradeToTeam}
                  onChange={(e) => setTradeToTeam(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
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
              <div className="mb-1 text-xs font-bold text-white/60">Search Players (name/id/role)</div>
              <input
                value={tradeSearch}
                onChange={(e) => setTradeSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white placeholder:text-white/30"
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
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="min-w-0">
                        <div className="truncate text-base font-black">{full}</div>
                        <div className="mt-1 text-xs text-white/60">
                          {p.league_id} • {p.team_name} • ID: {p.id}
                          {role ? <span className="ml-2 text-white/50">• Role: {role}</span> : null}
                        </div>
                      </div>

                      <button
                        disabled={busy || !tradeToTeam || tradeToTeam === tradeFromTeam}
                        onClick={() => doTradePlayer(p)}
                        className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-black text-amber-100 hover:bg-amber-500/15 disabled:opacity-60"
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

          {/* Export CSV */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-black">Export Player Stats (CSV)</div>
            <div className="mt-1 text-sm text-white/70">
              Downloads a CSV of every player across all leagues with their total stats (from <b>player_totals</b>).
            </div>

            <button
              disabled={exporting}
              onClick={exportPlayerStatsCSV}
              className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10 disabled:opacity-60"
            >
              {exporting ? "Exporting…" : "Download Player Stats CSV"}
            </button>
          </div>

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
                onClick={doClearSnapshots}
                className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10 disabled:opacity-60"
              >
                {busy ? "Working…" : "Clear Snapshots"}
              </button>
            </div>

            <div className="rounded-2xl border border-red-700/30 bg-red-950/20 p-5">
              <div className="text-lg font-black text-red-100">Reset Season (Wipe Test Data)</div>
              <div className="mt-1 text-sm text-red-200/80">
                Deletes games/events/rosters/standings/leaders. <b>Keeps leagues/players/points rules</b>.
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm font-bold text-red-100">
                <input type="checkbox" checked={keepHighlights} onChange={(e) => setKeepHighlights(e.target.checked)} />
                Keep highlights (recommended)
              </label>

              <div className="mt-2 text-xs text-red-200/70">
                Required confirmation word: <b>RESET</b>
              </div>

              <button
                disabled={busy}
                onClick={doResetSeason}
                className="mt-4 w-full rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-500/15 disabled:opacity-60"
              >
                {busy ? "Working…" : "RESET SEASON"}
              </button>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black text-amber-100">Stuck Games</div>
                <div className="mt-1 text-sm text-amber-200/70">
                  Games stuck in "active" status that were never finalized. Safe to remove if the game never finished.
                </div>
              </div>
              <button
                onClick={loadStuckGames}
                className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/20"
              >
                Load
              </button>
            </div>

            <div className="mt-3 text-xs text-white/60">
              Required confirmation word: <span className="font-black text-white">DELETE</span>
            </div>

            {stuckGames.length === 0 ? (
              <div className="mt-4 text-sm text-white/60">
                No stuck games found. Hit Load to check.
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {stuckGames.map((g) => (
                  <div key={g.id} className="rounded-2xl border border-amber-500/20 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-white/60">{new Date(g.created_at).toLocaleString()}</div>
                        <div className="mt-1 truncate text-lg font-black">{labelMatchup(g)}</div>
                        <div className="mt-1 text-sm text-white/70">
                          {g.league_key} • {g.sport} • Level {g.level}
                        </div>
                        <div className="mt-1 text-xl font-black tabular-nums">
                          {Number(g.score_a || 0)} – {Number(g.score_b || 0)}
                        </div>
                        <div className="mt-1 text-xs text-white/50">ID: {g.id}</div>
                      </div>
                      <button
                        onClick={() => forceCloseGame(g.id)}
                        disabled={busy}
                        className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-200 hover:bg-red-500/20 disabled:opacity-40"
                      >
                        Force Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-black">Rebuild Leaderboards</div>
            <div className="mt-1 text-sm text-white/70">Recalculates standings + stat leaders from all finalized games.</div>
            <div className="mt-3 text-xs text-white/60">
              Required confirmation word: <b>REBUILD</b>
            </div>

            <button
              disabled={busy}
              onClick={doRebuildLeaderboards}
              className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10 disabled:opacity-60"
            >
              {busy ? "Working…" : "Rebuild Leaderboards"}
            </button>
          </div>

          {/* Finalized games */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black">Finalized Games</div>
                <div className="mt-1 text-sm text-white/70">Admin-only delete. Rebuilds standings + leaders.</div>
              </div>

              <button
                onClick={loadFinalGames}
                disabled={busy || loadingFinal}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10 disabled:opacity-60"
              >
                {loadingFinal ? "Loading…" : "Refresh"}
              </button>
            </div>

            <div className="mt-3 text-xs text-white/60">
              Required confirmation word to delete: <b>DELETE</b>
            </div>

            {!finalGames.length ? (
              <div className="mt-4 text-sm text-white/60">{loadingFinal ? "Loading…" : "No finalized games found."}</div>
            ) : (
              <div className="mt-4 grid gap-3">
                {finalGames.map((g) => (
                  <div key={g.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-white/60">{new Date(g.created_at).toLocaleString()}</div>
                        <div className="mt-1 truncate text-lg font-black">{labelMatchup(g)}</div>
                        <div className="mt-1 text-sm text-white/70">
                          {g.league_key} • {g.sport} • Level {g.level} • {g.mode}{" "}
                          {g.is_staff_game ? (
                            <span className="ml-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-black text-purple-100">
                              STAFF
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-white/50">ID: {g.id}</div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                            <div className="text-xs text-white/60">Final</div>
                            <div className="mt-1 text-3xl font-black tabular-nums">
                              {Number(g.score_a || 0)} - {Number(g.score_b || 0)}
                            </div>
                          </div>

                          <button
                            disabled={busy}
                            onClick={() => deleteFinalGame(g.id)}
                            className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-500/15 disabled:opacity-60"
                          >
                            {busy ? "Working…" : "Delete Final Game"}
                          </button>
                        </div>

                        {overrideGameId === g.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              value={overridePoints}
                              onChange={(e) => setOverridePoints(e.target.value)}
                              placeholder="New win pts"
                              className="w-28 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-black text-amber-100 outline-none"
                            />
                            <button
                              disabled={busy}
                              onClick={() => updateGameWinPoints(g.id)}
                              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-black text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setOverrideGameId(null); setOverridePoints(""); }}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-black hover:bg-white/10"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setOverrideGameId(g.id); setOverridePoints(""); }}
                            className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs font-black text-amber-200 hover:bg-amber-500/10"
                          >
                            Override Win Points
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Non-game points */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black">Non-Game Points Entries</div>
                <div className="mt-1 text-sm text-white/70">Soft-delete entries (removes from totals immediately).</div>
              </div>

              <button
                onClick={loadNonGamePoints}
                disabled={busy || loadingNG}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10 disabled:opacity-60"
              >
                {loadingNG ? "Loading…" : "Refresh"}
              </button>
            </div>

            <div className="mt-3 text-xs text-white/60">
              Required confirmation word to delete: <b>DELETE</b>
            </div>

            {!ngRows.length ? (
              <div className="mt-4 text-sm text-white/60">{loadingNG ? "Loading…" : "No non-game entries found."}</div>
            ) : (
              <div className="mt-4 grid gap-3">
                {ngRows.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-white/60">
                          {r.entry_date} • {r.league_id}
                        </div>
                        <div className="mt-1 truncate text-lg font-black">
                          {r.team_name} +{Number(r.points || 0)}
                        </div>
                        <div className="mt-1 text-sm text-white/70">{r.reason}</div>
                        {r.notes ? <div className="mt-1 text-xs text-white/60">{r.notes}</div> : null}
                        <div className="mt-1 text-xs text-white/40">ID: {r.id}</div>
                      </div>

                      <button
                        disabled={busy}
                        onClick={() => deleteNonGame(r.id)}
                        className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-500/15 disabled:opacity-60"
                      >
                        {busy ? "Working…" : "Delete Entry"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 text-xs text-white/50">
            After deleting staff/non-game entries, the Staff tab + Non-Game tab + Overall toggles should reflect changes immediately.
          </div>
        </>
      )}
    </div>
  );
}
