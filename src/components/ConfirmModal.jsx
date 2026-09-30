"use client";

// Presentational only. Replaces native confirm()/alert() dialogs across the
// app — those aren't stylable, look jarring against the custom dark theme,
// and behave inconsistently on mobile browsers. Pair with
// src/lib/useConfirmDialog.js, which manages open/close state and resolves
// a promise the same way confirm() did, so call sites stay nearly identical
// (`if (!(await confirmAsync("..."))) return;` in place of
// `if (!confirm("...")) return;`).
export default function ConfirmModal({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      className="bc-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="bc-confirm-modal-title"
      aria-describedby="bc-confirm-modal-message"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div className="bc-modal">
        <div id="bc-confirm-modal-title" className="text-lg font-black text-white">
          {title}
        </div>
        {message ? (
          <div id="bc-confirm-modal-message" className="mt-2 whitespace-pre-line text-sm text-white/70">
            {message}
          </div>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white hover:bg-white/10"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-black disabled:opacity-50 ${
              danger
                ? "border-red-500/40 bg-red-500/15 text-red-100 hover:bg-red-500/25"
                : "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
