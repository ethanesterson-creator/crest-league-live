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

  // Avoid accidental unlock if env var isn't set
  const adminPw = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "";

  useEffect(() => {
    if (!adminPw) {
      setErr(
        "Admin password is not set. Add NEXT_PUBLIC_ADMIN_PASSWORD to .env.local and restart dev server."
      );
    }
  }, [adminPw]);

  function resetMessages() {
    setErr("");
    setMsg("");
  }

  function requireConfirm(word) {
    return confirmText.trim().toUpperCase() === word;
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

      setMsg(
        `✅ Season reset complete. (Highlights ${keepHighlights ? "kept" : "cleared"}.)`
      );
      setConfirmText("");
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

  return (
    <div className="pb-10">
      <div className="mt-6">
        <div className="text-2xl font-black">Admin Tools</div>
        <div className="text-sm text-white/70">
          Danger zone. Use for start-of-camp resets and fixing drift.
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {msg ? (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {msg}
        </div>
      ) : null}

      {!authed ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-lg font-black">Unlock Admin</div>
          <div className="mt-1 text-sm text-white/70">
            Enter the admin password (from <code>.env.local</code>).
          </div>

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
            <button
              onClick={login}
              className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 hover:bg-white/90"
            >
              Unlock
            </button>
          </div>

          <div className="mt-3 text-xs text-white/50">
            Note: This is a frontend guardrail while RLS is off. Later we’ll secure with real auth.
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-black">Confirmation</div>
            <div className="mt-1 text-sm text-white/70">
              Type the required word to enable a dangerous action.
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs font-bold text-white/60">Type here</div>
              <input
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white placeholder:text-white/30"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "CLEAR" or "RESET"'
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* Clear snapshots */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-lg font-black">Clear Standings + Leaders</div>
              <div className="mt-1 text-sm text-white/70">
                Sets standings + stat leaders back to zero by emptying the snapshot tables.
                <b> Does not delete games.</b>
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

            {/* Reset season */}
            <div className="rounded-2xl border border-red-700/30 bg-red-950/20 p-5">
              <div className="text-lg font-black text-red-100">Reset Season (Wipe Test Data)</div>
              <div className="mt-1 text-sm text-red-200/80">
                Deletes: live games, finalized games, rosters, live events, standings, stat leaders.
                <b> Keeps leagues/players/points rules</b> so the app stays functional.
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm font-bold text-red-100">
                <input
                  type="checkbox"
                  checked={keepHighlights}
                  onChange={(e) => setKeepHighlights(e.target.checked)}
                />
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

          <div className="mt-6 text-xs text-white/50">
            After a reset, pages will show “No data yet” until new games are finalized. That’s expected.
          </div>
        </>
      )}
    </div>
  );
}
