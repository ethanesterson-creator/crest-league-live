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

  // ---- Color War mode switch ----
  const [cwSettings, setCwSettings] = useState(null);       // full app_settings row
  const [sessionSwitchText, setSessionSwitchText] = useState("");
  const [showFinalGames, setShowFinalGames] = useState(false);
  // S1 archive viewer (read-only view of frozen Session 1)
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveLeague, setArchiveLeague] = useState("seniors");
  const [archiveStandings, setArchiveStandings] = useState([]);
  const [archiveLeaders, setArchiveLeaders] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [switchingSession, setSwitchingSession] = useState(false);
  const [modeSwitchText, setModeSwitchText] = useState(""); // typed confirmation
  const [switchingMode, setSwitchingMode] = useState(false);
  const [cwBlueNameInput, setCwBlueNameInput] = useState("");
  const [cwWhiteNameInput, setCwWhiteNameInput] = useState("");
 
 useEffect(() => {
    if (authed) loadCwSettings();
  }, [authed]);
  // ----------------------------
  // PER-LEAGUE STANDINGS (group leader view)
  // ----------------------------
  const [adminStandingsLeague, setAdminStandingsLeague] = useState("seniors");
  const [adminStandingsRows, setAdminStandingsRows] = useState([]);
  const [adminStandingsLoading, setAdminStandingsLoading] = useState(false);

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

  // Fixed internal Supabase Auth account for the admin panel — see
  // supabase/migrations/0001_harden_admin_access.sql. There's no real inbox at this address;
  // it exists only so Supabase Auth has a username to sign in with. The
  // actual secret is the password on that account (set in the Supabase
  // dashboard), never shipped to the client the way NEXT_PUBLIC_* vars are.
  const ADMIN_AUTH_EMAIL = "admin@crest-league.internal";

  // Restore an existing session on reload instead of forcing re-login.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setAuthed(true);
    });
  }, []);

  function resetMessages() {
    setErr("");
    setMsg("");
  }

  // One shared confirm box gates several unrelated destructive actions below
  // (trade, stuck-game removal, win-points override, clear/reset, two kinds
  // of delete). Consuming the typed word on every check — match or not —
  // means clicking the wrong action right after a real one always requires
  // a fresh, deliberate retype instead of silently reusing a leftover word.
  function requireConfirm(word) {
    const ok = confirmText.trim().toUpperCase() === word;
    setConfirmText("");
    return ok;
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

  async function loadAdminStandingsForLeague(lid) {
    setAdminStandingsLoading(true);
    try {
      const curSession = cwSettings?.current_session || "s2";
      const [{ data, error }, { data: ngData, error: ngErr }] = await Promise.all([
        supabase
          .from("standings")
          .select("league_id, sport, team_name, wins, losses, league_points, updated_at")
          .eq("sport", "overall")
          .eq("league_id", lid)
          .eq("season", "league")
          .eq("session", curSession),
        supabase
          .from("non_game_points")
          .select("team_name, points")
          .eq("league_id", lid)
          .eq("season", "league")
          .eq("session", curSession)
          .eq("deleted", false)
          .eq("status", "final")
          .limit(5000),
      ]);

      if (error) throw error;
      if (ngErr) throw ngErr;

      const ngMap = new Map();
      for (const r of ngData || []) {
        const key = norm(r.team_name);
        ngMap.set(key, (ngMap.get(key) || 0) + Number(r.points || 0));
      }

      const merged = (data || []).map((row) => ({
        ...row,
        league_points: Number(row.league_points || 0) + (ngMap.get(norm(row.team_name)) || 0),
      }));

      merged.sort((a, b) => {
        const ap = Number(a.league_points || 0);
        const bp = Number(b.league_points || 0);
        if (bp !== ap) return bp - ap;
        return Number(b.wins || 0) - Number(a.wins || 0);
      });

      setAdminStandingsRows(merged);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setAdminStandingsLoading(false);
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
        .eq("departed", false)
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
    // "Active" = live_games.status = 'active'
    const { data: liveIds, error: lErr } = await supabase
      .from("live_games")
      .select("id")
      .eq("status", "active")
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

      // Keep stat leaderboards in sync — without this, traded players show
      // their old team on the Leaders pages until manually fixed in SQL.
      const { error: totalsErr } = await supabase
        .from("player_totals")
        .update({ team_name: tradeToTeam })
        .eq("player_id", String(player.id))
        .eq("team_name", tradeFromTeam);

      // Also retag their historical stat events. If old events keep the old
      // team name, rebuild_leaderboards hits a duplicate-key collision and
      // every rebuild fails until it's fixed manually in SQL.
      const { error: eventsErr } = await supabase
        .from("live_events")
        .update({ team_name: tradeToTeam })
        .eq("player_id", String(player.id))
        .eq("team_name", tradeFromTeam);

      if (totalsErr || eventsErr) {
        // players.team_name already changed at this point — there's no
        // transaction tying these three writes together, so a failure here
        // means a real partial trade, not a clean rollback. Say so plainly
        // instead of a false "✅ Traded" — this needs manual SQL cleanup,
        // exactly like the comments above warn about.
        setErr(
          `⚠️ Partial trade: ${fullName}'s team changed to ${tradeToTeam}, but ` +
          `${[totalsErr && "player_totals", eventsErr && "live_events"].filter(Boolean).join(" and ")} ` +
          `did NOT update (${(totalsErr || eventsErr)?.message}). Fix this in SQL before the next leaderboard rebuild, or it will fail.`
        );
        return;
      }

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
    loadAdminStandingsForLeague(adminStandingsLeague);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    loadAdminStandingsForLeague(adminStandingsLeague);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminStandingsLeague]);

  // The mount-time load above can fire before loadCwSettings() resolves, in
  // which case it falls back to a hardcoded "s2" and can show the wrong
  // session's standings until this reloads once the real session is known.
  useEffect(() => {
    if (!authed) return;
    if (!cwSettings) return;
    loadAdminStandingsForLeague(adminStandingsLeague);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwSettings?.current_session]);

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
      if (rebuildErr) {
        setErr(`Win points saved, but standings rebuild failed: ${rebuildErr.message}. Re-run rebuild manually — standings are now stale.`);
        setOverrideGameId(null);
        setOverridePoints("");
        setConfirmText("");
        await loadFinalGames();
        return;
      }

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

    const ok = confirm(
      "⚠️ FINAL WARNING ⚠️\n\nThis permanently deletes EVERY game ever played this summer — every box score, every stat, every finalized result. This is NOT just test data once the season has started.\n\nThis cannot be undone.\n\nAre you absolutely sure you want to wipe the entire season?"
    );
    if (!ok) return;

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

  async function login() {
    resetMessages();
    if (!pw) return;

    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_AUTH_EMAIL,
      password: pw,
    });

    if (error) {
      setErr("Incorrect password.");
    } else {
      setAuthed(true);
      setPw("");
      setMsg("✅ Admin unlocked.");
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

  async function loadArchive(lid) {
    setArchiveLoading(true);
    try {
      // These three queries are independent of each other, so they run
      // together instead of one-after-another.
      const [{ data: st }, { data: ng }, { data: lead }] = await Promise.all([
        // Frozen Session 1 standings for this league (season league, session s1).
        supabase
          .from("standings")
          .select("league_id, team_name, wins, losses, league_points")
          .eq("sport", "overall")
          .eq("season", "league")
          .eq("session", "s1")
          .eq("league_id", lid),
        // Add S1 non-game points on top.
        supabase
          .from("non_game_points")
          .select("team_name, points")
          .eq("season", "league")
          .eq("session", "s1")
          .eq("league_id", lid)
          .eq("deleted", false)
          .eq("status", "final")
          .limit(5000),
        // Frozen S1 stat leaders (top values across sports) for this league.
        supabase
          .from("player_totals")
          .select("player_name, team_name, sport, stat_key, value")
          .eq("season", "league")
          .eq("session", "s1")
          .eq("league_id", lid)
          .order("value", { ascending: false })
          .limit(40),
      ]);

      const ngMap = {};
      for (const r of ng || []) {
        const k = String(r.team_name || "").toLowerCase();
        ngMap[k] = (ngMap[k] || 0) + Number(r.points || 0);
      }
      const merged = (st || []).map((r) => ({
        ...r,
        total: Number(r.league_points || 0) + (ngMap[String(r.team_name || "").toLowerCase()] || 0),
      })).sort((a, b) => b.total - a.total || Number(b.wins||0) - Number(a.wins||0));
      setArchiveStandings(merged);
      setArchiveLeaders((lead || []).filter((r) => Number(r.value) > 0).slice(0, 20));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setArchiveLoading(false);
    }
  }

  async function loadCwSettings() {
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
    if (error) {
      setErr(`Failed to load Session/Color War settings: ${error.message}. Values below may be stale — refresh before switching.`);
      return;
    }
    if (data) {
      setCwSettings(data);
      setCwBlueNameInput(data.cw_blue_name || "Blue");
      setCwWhiteNameInput(data.cw_white_name || "White");
    }
  }
 
  async function saveCwNames() {
    setErr(""); setMsg("");
    const { error } = await supabase.from("app_settings")
      .update({ cw_blue_name: cwBlueNameInput.trim() || "Blue", cw_white_name: cwWhiteNameInput.trim() || "White", updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) { setErr(error.message); return; }
    setMsg("Color War team names saved.");
    await loadCwSettings();
  }
 
  async function switchMode(targetMode) {
    // targetMode: 'league' | 'color_war'
    setErr(""); setMsg("");
    if (modeSwitchText.trim().toUpperCase() !== "SWITCH") {
      setErr('Type SWITCH in the box to confirm the mode change.');
      return;
    }
    setSwitchingMode(true);
    try {
      const { error } = await supabase.from("app_settings")
        .update({ mode: targetMode, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) { setErr(error.message); setSwitchingMode(false); return; }
 
      // Auto-rebuild the season we're entering so the board is never stale.
      const seasonArg = targetMode === "color_war" ? "cw" : "league";
      const { error: rbErr } = await supabase.rpc("rebuild_leaderboards", { p_season: seasonArg });
      if (rbErr) { setErr(`Mode switched, but rebuild failed: ${rbErr.message}. Re-run rebuild manually.`); }
 
      setModeSwitchText("");
      setMsg(targetMode === "color_war"
        ? "🔵⚪ Switched to COLOR WAR. The whole app now shows Blue vs White."
        : "Switched back to LEAGUE. All league data restored exactly as before.");
      await loadCwSettings();
    } finally {
      setSwitchingMode(false);
    }
  }

  async function startNewSession() {
    setErr(""); setMsg("");
    if (sessionSwitchText.trim().toUpperCase() !== "START SESSION 2") {
      setErr('Type START SESSION 2 exactly to confirm.');
      return;
    }
    setSwitchingSession(true);
    try {
      // Flip to s2 AND force league mode (color war comes later within s2).
      const { error } = await supabase.from("app_settings")
        .update({ current_session: "s2", mode: "league", updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) { setErr(error.message); setSwitchingSession(false); return; }

      // Rebuild the now-current slice (s2 league) so standings start clean.
      const { error: rbErr } = await supabase.rpc("rebuild_leaderboards", { p_season: "league", p_session: "s2" });
      if (rbErr) setErr(`Session switched, but rebuild failed: ${rbErr.message}. Re-run manually.`);

      setSessionSwitchText("");
      setMsg("✅ Session 2 is now live. Session 1 is frozen and preserved. The whole app now shows Session 2.");
      await loadCwSettings();
    } finally {
      setSwitchingSession(false);
    }
  }

  const [exportingCards, setExportingCards] = useState(false);

  // Player-card data export. One row per player (across BOTH sessions), with
  // identity, combined stat totals, best single-game performances, and win
  // record. This is the master data file for the imaging team.
  async function exportPlayerCards() {
    setErr(""); setMsg("Building player card data…"); setExportingCards(true);
    try {
      // These five are all independent full-table pulls — none depends on
      // another's result — so they run together instead of one-after-another.
      const [
        { data: players, error: pErr },
        { data: totals, error: totErr },
        { data: rosters, error: rosErr },
        { data: games, error: gErr },
        { data: events, error: evErr },
      ] = await Promise.all([
        // 1) Every player who ever came (any session). Include departed —
        //    cards are for everyone who attended.
        supabase
          .from("players")
          .select("id, first_name, last_name, league_id, team_name, s1_team, bunk, active_session, departed")
          .order("id", { ascending: true }),
        // 2) All stat totals across both sessions.
        supabase
          .from("player_totals")
          .select("player_id, session, sport, stat_key, value")
          .limit(20000),
        // 3) Win records: count finalized games each player's team won, per
        //    session. We compute from standings-independent game log via
        //    game_roster.
        supabase
          .from("game_roster")
          .select("game_id, player_id, team_side")
          .limit(50000),
        supabase
          .from("live_games")
          .select("id, score_a, score_b, session, status")
          .eq("status", "final")
          .limit(5000),
        // 4) Best single games: per player, the game where they logged the
        //    most of a single stat (e.g. 5 goals in one game).
        supabase
          .from("live_events")
          .select("game_id, player_id, sport, stat_key, delta")
          .eq("event_type", "stat")
          .limit(100000),
      ]);

      if (pErr) throw pErr;
      if (totErr) throw totErr;
      if (rosErr) throw rosErr;
      if (gErr) throw gErr;
      if (evErr) throw evErr;

      const gameById = {};
      for (const g of games || []) gameById[g.id] = g;

      // ---- aggregate ----
      // combined totals per player: {pid: {"sport stat": value}}
      const totMap = {};
      for (const t of totals || []) {
        const pid = String(t.player_id);
        const key = `${String(t.sport).toUpperCase()} ${String(t.stat_key).toUpperCase()}`;
        totMap[pid] = totMap[pid] || {};
        totMap[pid][key] = (totMap[pid][key] || 0) + Number(t.value || 0);
      }

      // wins per player
      const winMap = {};
      for (const r of rosters || []) {
        const g = gameById[r.game_id];
        if (!g) continue;
        const won = (r.team_side === "A" && Number(g.score_a) > Number(g.score_b)) ||
                    (r.team_side === "B" && Number(g.score_b) > Number(g.score_a));
        if (won) winMap[String(r.player_id)] = (winMap[String(r.player_id)] || 0) + 1;
      }

      // best single game per player: {pid: "5 G · SOCCER"}
      const perGameStat = {}; // pid -> {game_id -> {statkey -> sum, sport}}
      for (const e of events || []) {
        const pid = String(e.player_id);
        perGameStat[pid] = perGameStat[pid] || {};
        const gk = e.game_id;
        perGameStat[pid][gk] = perGameStat[pid][gk] || { sport: e.sport, stats: {} };
        const sk = String(e.stat_key).toUpperCase();
        perGameStat[pid][gk].stats[sk] = (perGameStat[pid][gk].stats[sk] || 0) + Number(e.delta || 0);
      }
      const bestGameMap = {};
      for (const pid of Object.keys(perGameStat)) {
        let best = null;
        for (const gk of Object.keys(perGameStat[pid])) {
          const g = perGameStat[pid][gk];
          for (const sk of Object.keys(g.stats)) {
            const v = g.stats[sk];
            if (!best || v > best.value) best = { value: v, stat: sk, sport: String(g.sport).toUpperCase() };
          }
        }
        if (best) bestGameMap[pid] = `${best.value} ${best.stat} · ${best.sport} (single game)`;
      }

      // ---- build rows ----
      const rows = [];
      for (const p of players || []) {
        const pid = String(p.id);
        const totals = totMap[pid] || {};
        // sort stat totals descending, make a readable line
        const totalsLine = Object.entries(totals)
          .filter(([k, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${v} ${k}`)
          .join(", ");
        rows.push({
          player_id: pid,
          first_name: p.first_name,
          last_name: p.last_name,
          league: p.league_id,
          team: p.team_name,
          bunk: p.bunk,
          sessions: p.active_session === "s2" ? (p.s1_team ? "Both" : "Session 2") : "Session 1",
          total_wins: winMap[pid] || 0,
          best_single_game: bestGameMap[pid] || "",
          all_stat_totals: totalsLine,
        });
      }

      const header = ["player_id","first_name","last_name","league","team","bunk","sessions","total_wins","best_single_game","all_stat_totals"];
      const lines = [header.join(",")];
      for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(","));
      downloadTextFile(`crest_player_cards_${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"));

      setMsg(`✅ Player card data exported — ${rows.length} players.`);
    } catch (e) {
      setErr(e?.message ?? String(e)); setMsg("");
    } finally {
      setExportingCards(false);
    }
  }

  async function exportPlayerStatsCSV() {
    resetMessages();
    setExporting(true);

    try {
      setMsg("Building CSV...");

      const norm2 = (s) => String(s ?? "").trim().toLowerCase();

      // These three are independent of each other, so they run together
      // instead of one-after-another.
      const [
        { data: players, error: pErr },
        { data: rules, error: rErr },
        { data: totals, error: tErr },
      ] = await Promise.all([
        // 1) Players (source of truth for names/teams)
        supabase
          .from("players")
          .select("id, league_id, team_name, first_name, last_name")
          .order("league_id", { ascending: true })
          .order("team_name", { ascending: true })
          .order("last_name", { ascending: true }),
        // 2) Rules: stat keys per sport (to build columns even if empty)
        supabase.from("points_rules").select("league_id, sport, stat_keys"),
        // 3) Totals: actual values
        supabase.from("player_totals").select("league_id, sport, player_id, stat_key, value"),
      ]);

      if (pErr) throw pErr;
      if (rErr) throw rErr;
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
        totalsMap.set(key, (totalsMap.get(key) || 0) + Number(t.value || 0));
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
      ) : (
        <>
          {/* Per-League Standings — group leader view */}
          <div className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-950/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black">Per-League Standings</div>
                <div className="mt-1 text-sm text-white/70">
                  For group leaders. Includes non-game points. The public Standings page now shows camp-wide totals only.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={adminStandingsLeague}
                  onChange={(e) => setAdminStandingsLeague(e.target.value)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
                >
                  <option value="seniors">Seniors</option>
                  <option value="juniors">Juniors</option>
                  <option value="sophomores">Sophomores</option>
                </select>
                <button
                  onClick={() => loadAdminStandingsForLeague(adminStandingsLeague)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              {adminStandingsLoading ? (
                <div className="py-4 text-sm text-white/60">Loading…</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-white/70">
                    <tr>
                      <th className="py-2">#</th>
                      <th className="py-2">Team</th>
                      <th className="py-2">W</th>
                      <th className="py-2">L</th>
                      <th className="py-2">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminStandingsRows.length ? (
                      adminStandingsRows.map((r, i) => (
                        <tr key={`${r.team_name}-${i}`} className="border-t border-white/10">
                          <td className="py-3 text-white/50">{i + 1}</td>
                          <td className="py-3 font-extrabold">{r.team_name}</td>
                          <td className="py-3">{r.wins}</td>
                          <td className="py-3">{r.losses}</td>
                          <td className="py-3 font-black">{r.league_points}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-white/60" colSpan={5}>
                          No standings yet for this league.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

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

            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="text-lg font-black">🃏 Player Card Data (for imaging team)</div>
              <div className="mt-1 text-sm text-white/70">
                The master keepsake file. One row per camper across <b>both sessions</b> — name, league, team, bunk, total wins, best single-game performance, and every stat total. This is what the imaging team turns into cards.
              </div>
              <button
                disabled={exportingCards}
                onClick={exportPlayerCards}
                className="mt-4 w-full rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-black text-amber-100 hover:bg-amber-500/15 disabled:opacity-60"
              >
                {exportingCards ? "Building…" : "Download Player Card Data"}
              </button>
            </div>
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
              <div className="text-lg font-black text-red-100">⚠️ Reset Season — Permanent Deletion</div>
              <div className="mt-1 text-sm text-red-200/80">
                Deletes <b>every game, stat, box score, and roster ever recorded</b> — not just test data. Once the season has started, this is irreversible. <b>Keeps leagues/players/points rules</b>.
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFinalGames((v) => !v)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10"
                >
                  {showFinalGames ? "Hide" : `Show (${finalGames.length})`}
                </button>
                <button
                  onClick={loadFinalGames}
                  disabled={busy || loadingFinal}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10 disabled:opacity-60"
                >
                  {loadingFinal ? "Loading…" : "Refresh"}
                </button>
              </div>
            </div>

            {showFinalGames ? (
            <>
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
            </>
            ) : null}
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

          {/* ================= SESSION CONTROL ================= */}
          <div className={`mt-8 rounded-2xl border p-5 ${cwSettings?.current_session === "s2" ? "border-purple-400/50 bg-purple-500/10" : "border-amber-400/30 bg-amber-500/5"}`}>
            <div className="text-lg font-black">Session Control</div>
            <div className="mt-1 text-sm text-white/60">
              Current session:{" "}
              <span className="font-black text-purple-300">
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
                  <button disabled={switchingSession} onClick={startNewSession}
                    className="rounded-xl border border-purple-400/40 bg-purple-500/15 px-5 py-2.5 text-sm font-black text-purple-100 hover:bg-purple-500/25 disabled:opacity-50">
                    {switchingSession ? "Starting…" : "→ Start Session 2"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-purple-400/20 bg-black/20 p-4 text-sm text-white/70">
                Session 2 is live. Session 1 is frozen and preserved in the database. There is no switch back — Session 1 remains viewable via the archive (read-only).
              </div>
            )}
          </div>
          {/* ================= END SESSION CONTROL ================= */}

          {/* ================= AWARDS CONTROL ================= */}
          <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
            <div className="text-lg font-black">🏆 Awards</div>
            <div className="mt-1 text-sm text-white/60">
              The Awards page shows live leaders during the session. When league play is over, mark it final to crown winners.
            </div>
            <button
              onClick={async () => {
                const cur = Boolean(cwSettings?.league_ended);
                const { error } = await supabase.from("app_settings")
                  .update({ league_ended: !cur }).eq("id", 1);
                if (error) { setErr(error.message); return; }
                setMsg(!cur ? "Awards now show FINAL winners." : "Awards back to live race.");
                await loadCwSettings();
              }}
              className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/15 px-5 py-2.5 text-sm font-black text-amber-100 hover:bg-amber-500/25"
            >
              {cwSettings?.league_ended ? "↩ Reopen (back to live race)" : "🏆 Mark league final (crown winners)"}
            </button>
          </div>
          {/* ================= END AWARDS CONTROL ================= */}

          {/* ================= SESSION 1 ARCHIVE (read-only) ================= */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-black">Session 1 Archive</div>
                <div className="mt-1 text-sm text-white/60">Read-only view of frozen Session 1 standings + stat leaders. Does not affect the current session.</div>
              </div>
              <button
                onClick={() => { const n = !archiveOpen; setArchiveOpen(n); if (n) loadArchive(archiveLeague); }}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/15">
                {archiveOpen ? "Hide" : "View Session 1"}
              </button>
            </div>

            {archiveOpen ? (
              <div className="mt-5">
                <div className="flex items-center gap-2">
                  {["seniors", "juniors", "sophomores"].map((lg) => (
                    <button key={lg}
                      onClick={() => { setArchiveLeague(lg); loadArchive(lg); }}
                      className={`rounded-xl border px-3 py-2 text-sm font-black ${archiveLeague === lg ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/15 bg-white/5 hover:bg-white/10"}`}>
                      {lg.charAt(0).toUpperCase() + lg.slice(1)}
                    </button>
                  ))}
                </div>

                {archiveLoading ? (
                  <div className="mt-4 text-sm text-white/60">Loading…</div>
                ) : (
                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-2 text-sm font-black uppercase tracking-widest text-white/50">Final Standings</div>
                      <table className="w-full text-left text-sm">
                        <thead className="text-white/50"><tr><th className="py-1">#</th><th>Team</th><th>W</th><th>L</th><th>Pts</th></tr></thead>
                        <tbody>
                          {archiveStandings.map((r, i) => (
                            <tr key={r.team_name} className="border-t border-white/10">
                              <td className="py-2 text-white/40">{i + 1}</td>
                              <td className="py-2 font-black">{r.team_name}</td>
                              <td className="py-2">{r.wins}</td>
                              <td className="py-2">{r.losses}</td>
                              <td className="py-2 font-black">{r.total}</td>
                            </tr>
                          ))}
                          {!archiveStandings.length ? <tr><td colSpan={5} className="py-3 text-white/50">No data.</td></tr> : null}
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-2 text-sm font-black uppercase tracking-widest text-white/50">Top Stat Leaders</div>
                      <div className="grid gap-1">
                        {archiveLeaders.map((r, i) => (
                          <div key={i} className="flex items-center justify-between border-t border-white/10 py-1.5 text-sm">
                            <div className="truncate font-bold">{r.player_name}</div>
                            <div className="ml-3 shrink-0 text-white/60">{r.value} {String(r.stat_key).toUpperCase()} · {String(r.sport).toUpperCase()}</div>
                          </div>
                        ))}
                        {!archiveLeaders.length ? <div className="py-3 text-white/50">No data.</div> : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          {/* ================= END SESSION 1 ARCHIVE ================= */}


          {/* ================= COLOR WAR CONTROL ================= */}
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
            <button onClick={saveCwNames}
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
                  <button disabled={switchingMode} onClick={() => switchMode("league")}
                    className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-5 py-2.5 text-sm font-black text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50">
                    {switchingMode ? "Switching…" : "→ Switch to LEAGUE"}
                  </button>
                ) : (
                  <button disabled={switchingMode} onClick={() => switchMode("color_war")}
                    className="rounded-xl border border-blue-400/40 bg-blue-500/15 px-5 py-2.5 text-sm font-black text-blue-100 hover:bg-blue-500/25 disabled:opacity-50">
                    {switchingMode ? "Switching…" : "→ Switch to COLOR WAR"}
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* ================= END COLOR WAR CONTROL ================= */}
        </>
      )}
    </div>
  );
}