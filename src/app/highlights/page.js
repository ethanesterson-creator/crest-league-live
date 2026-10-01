"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotifyingErr } from "@/lib/useNotifyingErr";
import { useConfirmDialog } from "@/lib/useConfirmDialog";

import { PageHeader, EmptyState, ErrorNote } from "@/components/ui";
export default function HighlightsAdminPage() {
  const [items, setItems] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useNotifyingErr();
  const { confirmAsync, confirmModal } = useConfirmDialog();
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
    const ok = await confirmAsync("This cannot be undone.", { title: "Delete this photo permanently?", confirmLabel: "Delete" });
    if (!ok) return;
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
    <div className="pb-10">
      {confirmModal}
      <PageHeader
        title="Highlights"
        description="Upload photos for the wall display. They rotate automatically in the Highlights scene."
      />

      {err ? <div className="mt-4"><ErrorNote>{err}</ErrorNote></div> : null}

      {/* Upload zone */}
      <label className={`upload-plate mt-6 ${uploading ? "opacity-60" : ""}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
        </svg>
        <div className="bc-display mt-2 text-4xl leading-none">
          {uploading ? progress : "Upload photos or videos"}
        </div>
        {!uploading ? <span className="btn mt-3" aria-hidden="true">Choose files</span> : null}
        <div className="mt-2 text-sm text-[var(--ink-2)]">
          Select several at once. They go live on the board immediately.
        </div>
      </label>

      {progress && !uploading ? (
        <div role="status" className="mt-3 rounded-md border-[1.5px] border-[var(--good)] px-4 py-3 text-sm font-bold text-[var(--good-ink)]">{progress}</div>
      ) : null}

      {/* Photo grid */}
      {items.length ? (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className={`overflow-hidden rounded-md border bg-[var(--sheet)] ${item.show_on_board ? "border-[var(--ink)]" : "border-[var(--rule)]"}`}>
              <div className="aspect-video bg-[var(--ink)]">
                {item.file_type === "video" ? (
                  <video src={publicUrl(item.file_path)} className={`h-full w-full object-cover ${item.show_on_board ? "" : "opacity-40"}`} muted playsInline />
                ) : (
                  <img src={publicUrl(item.file_path)} alt={item.title || "Camp highlight photo"} className={`h-full w-full object-cover ${item.show_on_board ? "" : "opacity-40"}`} loading="lazy" />
                )}
              </div>
              <div className="space-y-2 p-3">
                <input
                  defaultValue={item.title || ""}
                  aria-label="Caption"
                  placeholder="Caption (optional)"
                  onBlur={(e) => { if (e.target.value !== (item.title || "")) updateTitle(item, e.target.value); }}
                  className="w-full"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleBoard(item)}
                    aria-pressed={!!item.show_on_board}
                    className={`btn btn-sm flex-1 ${item.show_on_board ? "" : "btn-secondary"}`}
                  >
                    {item.show_on_board ? "On the board" : "Hidden"}
                  </button>
                  <button onClick={() => deleteItem(item)} className="btn btn-danger btn-sm">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState title="No photos yet">Upload some above and they will rotate on the wall display.</EmptyState>
        </div>
      )}
    </div>
  );
}
