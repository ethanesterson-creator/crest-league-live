"use client";

import { useEffect, useState } from "react";
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

  // NEW: non-game points list
  const [ngRows, setNgRows] = useState([]);
  const [loadingNG, setLoadingNG] = useState(false);

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

  async function loadFinalGames() {
    setLoadingFinal(true);
    try {
      const { data, error } = await supabase
        .from("live_games")
        .select("id, created_at, league_key, sport, level, mode, matchup_type, team_a1, team_a2, team_b1, team_b2, score_a, score_b, status, is_staff_game")
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

  useEffect(() => {
    if (!authed) return;
    loadFinalGames();
    loadNonGamePoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

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

  return (
    <div className="pb-10">
      <div className="mt-6">
        <div className="text-2xl font-black">Admin Tools</div>
        <div className="text-sm text-white/70">Used For Deleting Games and Fixing Snapshots.</div>
      </div>

      {err ? <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{err}</div> : null}
      {msg ? <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{msg}</div> : null}

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
                placeholder='Type "CLEAR", "RESET", "REBUILD", or "DELETE"'
              />
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

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-black">Rebuild Leaderboards</div>
            <div className="mt-1 text-sm text-white/70">
              Recalculates standings + stat leaders from all finalized games.
            </div>
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
