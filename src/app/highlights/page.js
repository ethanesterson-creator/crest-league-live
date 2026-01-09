"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const BUCKET = "highlights";

const SPORTS = [
  "Hoop",
  "Soccer",
  "Softball",
  "Volleyball",
  "Football",
  "Speedball",
  "Euro",
  "Hockey",
];

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function prettyLeague(id) {
  const x = String(id || "");
  if (x === "sophomores") return "Sophomores";
  if (x === "juniors") return "Juniors";
  if (x === "seniors") return "Seniors";
  return x;
}

function isVideo(file) {
  const t = String(file?.type || "");
  return t.startsWith("video/");
}
function isImage(file) {
  const t = String(file?.type || "");
  return t.startsWith("image/");
}

export default function HighlightsPage() {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState("seniors");
  const [sport, setSport] = useState("Hoop");
  const [teamName, setTeamName] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [showOnBoard, setShowOnBoard] = useState(true);

  const [file, setFile] = useState(null);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadLeagues() {
    const { data, error } = await supabase
      .from("leagues")
      .select("id, name")
      .order("id", { ascending: true });

    if (error) {
      setLeagues([
        { id: "sophomores", name: "Sophomores" },
        { id: "juniors", name: "Juniors" },
        { id: "seniors", name: "Seniors" },
      ]);
      return;
    }
    setLeagues(data || []);
  }

  async function loadHighlights() {
    setErr("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("highlights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeagues();
    loadHighlights();
  }, []);

  async function uploadHighlight() {
    setErr("");

    if (!file) {
      setErr("Pick a file first (video or image).");
      return;
    }
    if (!isVideo(file) && !isImage(file)) {
      setErr("File must be a video or image.");
      return;
    }

    setBusy(true);
    try {
      // 1) upload to storage
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const kind = isVideo(file) ? "video" : "image";
      const safeLeague = norm(leagueId);
      const safeSport = norm(sport);
      const ts = Date.now();
      const path = `${safeLeague}/${safeSport}/${ts}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });

      if (upErr) throw upErr;

      // 2) insert row into highlights table
      const { error: insErr } = await supabase.from("highlights").insert({
        league_id: norm(leagueId),
        sport: sport, // keep display sport; we normalize when filtering
        team_name: teamName ? norm(teamName) : null,
        title: title || null,
        notes: notes || null,
        file_path: path,
        file_type: kind,
        show_on_board: !!showOnBoard,
      });

      if (insErr) throw insErr;

      // reset inputs
      setFile(null);
      setTitle("");
      setNotes("");
      setTeamName("");

      await loadHighlights();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleShow(id, next) {
    setErr("");
    const { error } = await supabase
      .from("highlights")
      .update({ show_on_board: next })
      .eq("id", id);

    if (error) {
      setErr(error.message);
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, show_on_board: next } : x)));
  }

  async function deleteHighlight(item) {
    if (!confirm("Delete this highlight? This will remove the file and the record.")) return;
    setErr("");
    setBusy(true);

    try {
      // delete file from storage
      await supabase.storage.from(BUCKET).remove([item.file_path]);

      // delete row
      const { error } = await supabase.from("highlights").delete().eq("id", item.id);
      if (error) throw error;

      await loadHighlights();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function publicUrl(path) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl;
  }

  return (
    <div className="pb-10">
      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-black">Highlights</div>
          <div className="text-sm text-white/70">
            Upload clips + photos. Mark “Show on Display Board” to feature them.
          </div>
        </div>

        <a className="bc-muted" href="/display" style={{ fontSize: 14 }}>
          Go to Display Board →
        </a>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {/* Upload card */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-black">Upload a highlight</div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-bold text-white/60">League</div>
            <select
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
            >
              {(leagues?.length
                ? leagues
                : [
                    { id: "sophomores", name: "Sophomores" },
                    { id: "juniors", name: "Juniors" },
                    { id: "seniors", name: "Seniors" },
                  ]
              ).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name ?? prettyLeague(l.id)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold text-white/60">Sport</div>
            <select
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
            >
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold text-white/60">Team (optional)</div>
            <input
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white placeholder:text-white/30"
              placeholder="homeostasis"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-bold text-white/60">Title (optional)</div>
            <input
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white placeholder:text-white/30"
              placeholder="Buzzer beater!"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <div className="mb-1 text-xs font-bold text-white/60">Notes (optional)</div>
            <textarea
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
              rows={3}
              placeholder="Anything else staff should know?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={showOnBoard}
                onChange={(e) => setShowOnBoard(e.target.checked)}
              />
              Show on Display Board
            </label>

            <div className="text-xs text-white/60">Videos + images supported</div>
          </div>

          <div className="md:col-span-2">
            <input
              type="file"
              accept="video/*,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <button
          onClick={uploadHighlight}
          disabled={busy}
          className="mt-4 w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-lg font-black text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {busy ? "Uploading…" : "Upload Highlight"}
        </button>
      </div>

      {/* Gallery */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-baseline justify-between">
          <div className="text-lg font-black">Recent highlights</div>
          <button
            onClick={loadHighlights}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-4 text-white/70">Loading…</div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {items.length ? (
              items.map((h) => {
                const url = publicUrl(h.file_path);
                return (
                  <div key={h.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs text-white/60">
                      {prettyLeague(h.league_id)} • {h.sport} •{" "}
                      {h.team_name ? h.team_name : "—"} •{" "}
                      {new Date(h.created_at).toLocaleString()}
                    </div>

                    <div className="mt-1 text-base font-extrabold">
                      {h.title ? h.title : "Highlight"}
                    </div>

                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      {h.file_type === "video" ? (
                        <video src={url} controls className="w-full" />
                      ) : (
                        <img src={url} alt={h.title ?? "Highlight"} className="w-full object-cover" />
                      )}
                    </div>

                    {h.notes ? (
                      <div className="mt-2 text-sm text-white/70">{h.notes}</div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        onClick={() => toggleShow(h.id, !h.show_on_board)}
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
                      >
                        {h.show_on_board ? "Hide from Board" : "Show on Board"}
                      </button>

                      <button
                        onClick={() => deleteHighlight(h)}
                        className="rounded-xl border border-red-700/40 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-100 hover:bg-red-500/15"
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-white/60">No highlights yet. Upload your first one above.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
