"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { useConfirmDialog } from "@/lib/useConfirmDialog";
import { downloadTextFile, buildPlayerCardsCSV, buildPlayerStatsCSV } from "./exportUtils";
import LoginPanel from "./components/LoginPanel";
import PerLeagueStandings from "./components/PerLeagueStandings";
import ConfirmBox from "./components/ConfirmBox";
import TradesPanel from "./components/TradesPanel";
import ExportsPanel from "./components/ExportsPanel";
import DangerZonePanel from "./components/DangerZonePanel";
import StuckGamesPanel from "./components/StuckGamesPanel";
import RebuildPanel from "./components/RebuildPanel";
import FinalGamesPanel from "./components/FinalGamesPanel";
import NonGamePointsPanel from "./components/NonGamePointsPanel";
import SessionControlPanel from "./components/SessionControlPanel";
import AwardsControlPanel from "./components/AwardsControlPanel";
import DisplayModePanel from "./components/DisplayModePanel";
import ArchivePanel from "./components/ArchivePanel";
import ColorWarControlPanel from "./components/ColorWarControlPanel";

import { PageHeader, ErrorNote } from "@/components/ui";
export default function AdminPage() {
  const [err, setErr] = useNotifyingErr();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirmAsync, confirmModal } = useConfirmDialog();
  const [switchingDisplayMode, setSwitchingDisplayMode] = useState(false);

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

    const ok = await confirmAsync(
      `${fullName}\n${tradeLeague}: ${tradeFromTeam} → ${tradeToTeam}\n\nThis only affects FUTURE rosters. Past games stay unchanged.`,
      { title: "Trade this player?", confirmLabel: "Trade", danger: false }
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
        // instead of a false "Traded" — this needs manual SQL cleanup,
        // exactly like the comments above warn about.
        setErr(
          `Partial trade: ${fullName}'s team changed to ${tradeToTeam}, but ` +
          `${[totalsErr && "player_totals", eventsErr && "live_events"].filter(Boolean).join(" and ")} ` +
          `did NOT update (${(totalsErr || eventsErr)?.message}). Fix this in SQL before the next leaderboard rebuild, or it will fail.`
        );
        return;
      }

      setMsg(`Traded ${fullName}: ${tradeFromTeam} → ${tradeToTeam} (${updated.league_id}).`);
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

    const ok = await confirmAsync(
      "This will delete it WITHOUT updating standings or stat leaders.\nUse this only for games that never finished and have no valid score.",
      { title: "Force-close this stuck game?", confirmLabel: "Force Close" }
    );
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("delete_unfinalized_game", { gid });
      if (error) throw error;
      setMsg("Stuck game removed.");
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

      setMsg(`Win points updated to ${pts} and standings rebuilt.`);
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

      setMsg("Cleared standings + stat leaders. (Games remain untouched.)");
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

    const ok = await confirmAsync(
      "This permanently deletes EVERY game ever played this summer — every box score, every stat, every finalized result. This is NOT just test data once the season has started.\n\nThis cannot be undone. Are you absolutely sure you want to wipe the entire season?",
      { title: "Final warning", confirmLabel: "Wipe Season" }
    );
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_reset_season", {
        p_keep_highlights: keepHighlights,
      });
      if (error) throw error;

      setMsg(`Season reset complete. (Highlights ${keepHighlights ? "kept" : "cleared"}.)`);
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

      setMsg("Rebuilt standings + stat leaders from finalized games.");
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

    const ok = await confirmAsync(
      "This will remove the game + events + roster, then rebuild standings + stat leaders.\n\nThis cannot be undone.",
      { title: "Delete this finalized game?", confirmLabel: "Delete" }
    );
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_delete_finalized_game", { gid });
      if (error) throw error;

      setMsg("Finalized game deleted. Standings + stat leaders rebuilt.");
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

    const ok = await confirmAsync(
      "This will remove it from totals immediately.",
      { title: "Delete this Non-Game Points entry?", confirmLabel: "Delete" }
    );
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase
        .from("non_game_points")
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      setMsg("Non-game points entry deleted.");
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
      setMsg("Admin unlocked.");
    }
  }

  async function switchDisplayMode(targetMode) {
    setErr(""); setMsg("");
    setSwitchingDisplayMode(true);
    try {
      const { error } = await supabase.from("app_settings")
        .update({ display_mode: targetMode, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) { setErr(error.message); return; }
      setMsg(targetMode === "banquet"
        ? "Display board switched to Banquet mode."
        : "Display board switched to Season mode.");
      await loadCwSettings();
    } finally {
      setSwitchingDisplayMode(false);
    }
  }

  async function toggleLeagueEnded() {
    const cur = Boolean(cwSettings?.league_ended);
    const { error } = await supabase.from("app_settings")
      .update({ league_ended: !cur }).eq("id", 1);
    if (error) { setErr(error.message); return; }
    setMsg(!cur ? "Awards now show FINAL winners." : "Awards back to live race.");
    await loadCwSettings();
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

  async function loadArchive(lid) {
    setArchiveLoading(true);
    try {
      // These three queries are independent of each other, so they run
      // together instead of one-after-another.
      const [{ data: st, error: stErr }, { data: ng, error: ngErr }, { data: lead, error: leadErr }] = await Promise.all([
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

      // A failed query here used to fall through to `|| []`, which renders
      // identically to "no games this session" on a page whose whole job is
      // showing that Session 1 data is still intact — the one place a
      // silent empty state is most likely to be mistaken for data loss.
      const loadErr = stErr || ngErr || leadErr;
      if (loadErr) throw loadErr;

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
        ? "Switched to Color War. The whole app now shows Blue vs White."
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
      setMsg("Session 2 is now live. Session 1 is frozen and preserved. The whole app now shows Session 2.");
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
        { data: totals, error: tErr },
        { data: rosters, error: rErr },
        { data: games, error: gErr },
        { data: events, error: eErr },
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
        //    game_roster. Only rows where the player actually played — a
        //    bench player added to the roster pool but never toggled "In"
        //    shouldn't be credited with the team's win.
        supabase
          .from("game_roster")
          .select("game_id, player_id, team_side")
          .eq("is_playing", true)
          .limit(50000),
        // Also carries `sport` for the best-single-game lookup below --
        // live_events has no sport column of its own (confirmed live:
        // "column live_events.sport does not exist", despite CLAUDE.md's
        // schema notes claiming otherwise), so each event's sport has to be
        // derived from its game instead.
        supabase
          .from("live_games")
          .select("id, sport, score_a, score_b, session, status")
          .eq("status", "final")
          .limit(5000),
        // 4) Best single games: per player, the game where they logged the
        //    most of a single stat (e.g. 5 goals in one game).
        supabase
          .from("live_events")
          .select("game_id, player_id, stat_key, delta")
          .eq("event_type", "stat")
          .limit(100000),
      ]);

      if (pErr) throw pErr;
      if (tErr) throw tErr;
      if (rErr) throw rErr;
      if (gErr) throw gErr;
      if (eErr) throw eErr;

      const { csv, count } = buildPlayerCardsCSV(players, totals, rosters, games, events);
      downloadTextFile(`crest_player_cards_${new Date().toISOString().slice(0,10)}.csv`, csv);

      setMsg(`Player card data exported — ${count} players.`);
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

      const csv = buildPlayerStatsCSV(players, rules, totals);
      downloadTextFile(`crest_player_stats_${new Date().toISOString().slice(0, 10)}.csv`, csv);

      setMsg("CSV downloaded.");
    } catch (e) {
      setErr(e?.message ?? String(e));
      setMsg("");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="pb-10">
      {confirmModal}

      <PageHeader title="Admin tools" description="Scoring corrections, rosters, season controls, and exports." />

      {err ? <div className="mt-4"><ErrorNote>{err}</ErrorNote></div> : null}
      {msg ? (
        <div role="status" className="mt-4 rounded-md border-[1.5px] border-[var(--good)] p-3 text-sm font-semibold text-[var(--good-ink)]">
          {msg}
        </div>
      ) : null}

      {!authed ? (
        <LoginPanel pw={pw} setPw={setPw} login={login} />
      ) : (
        <>
          <PerLeagueStandings
            league={adminStandingsLeague}
            setLeague={setAdminStandingsLeague}
            rows={adminStandingsRows}
            loading={adminStandingsLoading}
            onRefresh={() => loadAdminStandingsForLeague(adminStandingsLeague)}
          />

          <ConfirmBox value={confirmText} onChange={setConfirmText} />

          <TradesPanel
            loadingTradeMeta={loadingTradeMeta}
            onRefresh={loadTradeMeta}
            tradeLeague={tradeLeague} setTradeLeague={setTradeLeague} leagueOptions={leagueOptions}
            tradeFromTeam={tradeFromTeam} setTradeFromTeam={setTradeFromTeam}
            tradeToTeam={tradeToTeam} setTradeToTeam={setTradeToTeam}
            teamOptions={teamOptions}
            tradeSearch={tradeSearch} setTradeSearch={setTradeSearch}
            filteredFromPlayers={filteredFromPlayers}
            busy={busy} onTrade={doTradePlayer}
          />

          <ExportsPanel
            exporting={exporting} onExportStats={exportPlayerStatsCSV}
            exportingCards={exportingCards} onExportCards={exportPlayerCards}
          />

          <DangerZonePanel
            busy={busy} onClearSnapshots={doClearSnapshots}
            keepHighlights={keepHighlights} setKeepHighlights={setKeepHighlights}
            onResetSeason={doResetSeason}
          />

          <StuckGamesPanel
            stuckGames={stuckGames} onLoad={loadStuckGames}
            busy={busy} onForceClose={forceCloseGame}
            labelMatchup={labelMatchup}
          />

          <RebuildPanel busy={busy} onRebuild={doRebuildLeaderboards} />

          <FinalGamesPanel
            showFinalGames={showFinalGames} setShowFinalGames={setShowFinalGames}
            finalGames={finalGames} loadingFinal={loadingFinal} onRefresh={loadFinalGames}
            busy={busy} onDelete={deleteFinalGame}
            overrideGameId={overrideGameId} setOverrideGameId={setOverrideGameId}
            overridePoints={overridePoints} setOverridePoints={setOverridePoints}
            onSaveOverride={updateGameWinPoints}
            labelMatchup={labelMatchup}
          />

          <NonGamePointsPanel
            ngRows={ngRows} loadingNG={loadingNG} onRefresh={loadNonGamePoints}
            busy={busy} onDelete={deleteNonGame}
          />

          <div className="mt-6 text-xs text-white/50">
            After deleting staff/non-game entries, the Staff tab + Non-Game tab + Overall toggles should reflect changes immediately.
          </div>

          <SessionControlPanel
            cwSettings={cwSettings}
            sessionSwitchText={sessionSwitchText} setSessionSwitchText={setSessionSwitchText}
            switchingSession={switchingSession} onStartSession2={startNewSession}
          />

          <AwardsControlPanel cwSettings={cwSettings} onToggle={toggleLeagueEnded} />

          <DisplayModePanel
            cwSettings={cwSettings}
            switching={switchingDisplayMode}
            onSwitch={switchDisplayMode}
          />

          <ArchivePanel
            archiveOpen={archiveOpen}
            onToggle={() => { const n = !archiveOpen; setArchiveOpen(n); if (n) loadArchive(archiveLeague); }}
            archiveLeague={archiveLeague}
            onSelectLeague={(lg) => { setArchiveLeague(lg); loadArchive(lg); }}
            archiveLoading={archiveLoading}
            archiveStandings={archiveStandings}
            archiveLeaders={archiveLeaders}
          />

          <ColorWarControlPanel
            cwSettings={cwSettings}
            cwBlueNameInput={cwBlueNameInput} setCwBlueNameInput={setCwBlueNameInput}
            cwWhiteNameInput={cwWhiteNameInput} setCwWhiteNameInput={setCwWhiteNameInput}
            onSaveNames={saveCwNames}
            modeSwitchText={modeSwitchText} setModeSwitchText={setModeSwitchText}
            switchingMode={switchingMode} onSwitchMode={switchMode}
          />
        </>
      )}
    </div>
  );
}
