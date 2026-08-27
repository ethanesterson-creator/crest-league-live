"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function HighlightsAdminPage() {
  const [items, setItems] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const fileInputRef = useRef(null);

  async function load() {
    const { data, error } = await supabase
      .from("highlights")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { setErr(error.message); return; }
    setItems(data || []);
  }

  useEffect(() => { load(); }, []);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (!files.length) return;

    setErr("");
    setUploading(true);

    let done = 0;
    for (const file of files) {
      setProgress(`Uploading ${done + 1} of ${files.length}…`);
      try {
        const isVideo = file.type.startsWith("video/");
        const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("highlights")
          .upload(path, file, { contentType: file.type, upsert: false });

        if (upErr) { setErr(`${file.name}: ${upErr.message}`); continue; }

        const { error: insErr } = await supabase.from("highlights").insert({
          file_path: path,
          file_type: isVideo ? "video" : "image",
          title: "",
          show_on_board: true,
        });

        if (insErr) { setErr(`${file.name}: ${insErr.message}`); continue; }
        done += 1;
      } catch (e) {
        setErr(`${file.name}: ${e?.message ?? String(e)}`);
      }
    }

    setProgress(done ? `Uploaded ${done} file${done === 1 ? "" : "s"} ✓` : "");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
    setTimeout(() => setProgress(""), 4000);
  }

  async function toggleBoard(item) {
    const { error } = await supabase
      .from("highlights")
      .update({ show_on_board: !item.show_on_board })
      .eq("id", item.id);
    if (error) { setErr(error.message); return; }
    setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, show_on_board: !item.show_on_board } : x));
  }

  async function updateTitle(item, title) {
    const { error } = await supabase
      .from("highlights")
      .update({ title })
      .eq("id", item.id);
    if (error) { setErr(error.message); return; }
    setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, title } : x));
  }

  async function deleteItem(item) {
    if (!confirm("Delete this photo permanently?")) return;
    await supabase.storage.from("highlights").remove([item.file_path]);
    const { error } = await supabase.from("highlights").delete().eq("id", item.id);
    if (error) { setErr(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== item.id));
  }

  function publicUrl(path) {
    const { data } = supabase.storage.from("highlights").getPublicUrl(path);
    return data?.publicUrl;
  }

  return (
    <main className="min-h-screen bg-[#0a1628] px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-black">Highlights Manager</h1>
        <p className="mt-1 text-sm text-white/50">
          Upload photos for the display board. They rotate automatically in the Highlights scene.
        </p>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm font-bold text-red-200">{err}</div>
        ) : null}

        {/* Upload zone */}
        <label
          className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition ${uploading ? "border-white/10 bg-white/[0.02] opacity-60" : "border-blue-500/40 bg-blue-500/5 active:bg-blue-500/10"}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="text-5xl">📸</div>
          <div className="mt-3 text-lg font-black">
            {uploading ? progress : "Tap to upload photos or videos"}
          </div>
          <div className="mt-1 text-xs text-white/40">
            Select multiple at once. They go live on the board immediately.
          </div>
        </label>

        {progress && !uploading ? (
          <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm font-black text-emerald-200">{progress}</div>
        ) : null}

        {/* Photo grid */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className={`overflow-hidden rounded-2xl border ${item.show_on_board ? "border-emerald-500/40" : "border-white/10 opacity-50"} bg-white/[0.03]`}>
              <div className="aspect-video bg-black">
                {item.file_type === "video" ? (
                  <video src={publicUrl(item.file_path)} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={publicUrl(item.file_path)} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="space-y-2 p-3">
                <input
                  defaultValue={item.title || ""}
                  placeholder="Caption (optional)"
                  onBlur={(e) => { if (e.target.value !== (item.title || "")) updateTitle(item, e.target.value); }}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none placeholder:text-white/25 focus:border-white/30"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleBoard(item)}
                    className={`h-10 flex-1 rounded-lg border px-2 text-xs font-black ${item.show_on_board ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/5 text-white/40"}`}
                  >
                    {item.show_on_board ? "On Board ✓" : "Hidden"}
                  </button>
                  <button
                    onClick={() => deleteItem(item)}
                    className="h-10 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-black text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!items.length && (
          <div className="mt-8 text-center text-sm text-white/30">No photos yet. Upload some above.</div>
        )}
      </div>
    </main>
  );
}