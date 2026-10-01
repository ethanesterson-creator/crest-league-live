// Shared presentational primitives for the "CBSN at Dusk" design system
// (see DESIGN.md). Purely visual: no data, routing, or app logic in here.
import Link from "next/link";
import FlashNumber from "@/components/FlashNumber";

// The page banner: the real dusk-lake photo with a slow push-in, a diagonal
// cut on the bottom edge, and the title set huge. `pos` re-crops the photo so
// no two pages open on the same frame. `crest` floats the league shield.
export function PageHeader({ title, description, children, pos = "50% 62%", tall = false, crest = false }) {
  return (
    <header className={`cl-hero ${tall ? "tall" : ""}`} style={{ "--hero-pos": pos }}>
      <div className="cl-hero-bg" aria-hidden="true" />
      {crest ? <img className="cl-hero-crest" src="/crest-logo.png" alt="" width="230" height="230" /> : null}
      <div className="cl-hero-in">
        <h1 className="bc-page-title reveal">{title}</h1>
        {description ? (
          <p className="reveal max-w-[52ch] text-lg text-[var(--ink-2)]" style={{ "--i": 1 }}>{description}</p>
        ) : null}
        {children ? (
          <div className="reveal flex flex-wrap items-end gap-3" style={{ "--i": 2 }}>{children}</div>
        ) : null}
      </div>
    </header>
  );
}

// A labelled control: the label is always visible, never a placeholder.
export function Field({ label, className = "", children }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="bc-select-label">{label}</span>
      {children}
    </label>
  );
}

// One broadcast plate with a slanted-tab title.
export function Sheet({ title, meta, className = "", children, as: Tag = "section", index = 0 }) {
  return (
    <Tag className={`bc-card bc-card-pad reveal ${className}`} style={{ "--i": index }}>
      {title ? (
        <div className="bc-section-head">
          <h2>{title}</h2>
          {meta ? <span className="bc-label">{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="bc-empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function ErrorNote({ children, onRetry }) {
  if (!children) return null;
  return (
    <div role="alert" className="bc-error flex flex-wrap items-center justify-between gap-3">
      <span>{children}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm">
          Try again
        </button>
      ) : null}
    </div>
  );
}

// Loading is a stack of quiet rows, not a spinner: the page keeps its shape.
export function SkeletonRows({ rows = 6, label = "Loading" }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <span className="bc-skel" style={{ width: 34, height: 34 }} />
          <span className="bc-skel" style={{ flex: 1, height: 20 }} />
          <span className="bc-skel" style={{ width: 56, height: 20 }} />
        </div>
      ))}
    </div>
  );
}

// A thin proportional bar. `value` / `max` decide how full it is; `lead`
// brightens the top entry. Animates in on load.
export function Meter({ value, max, lead = false, index = 0 }) {
  const pct = max > 0 ? Math.max(3, Math.min(100, (Number(value) / max) * 100)) : 0;
  return (
    <div className={`meter ${lead ? "lead" : ""}`} aria-hidden="true">
      <i style={{ "--w": `${pct}%`, "--i": index }} />
    </div>
  );
}

// The broadcast score bug: status tag on the left, both teams stacked with
// their scores, optional right-hand slot. The losing side of a final dims.
export function ScoreBug({ href, status = "final", tag, a, b, children, index = 0 }) {
  const an = Number(a.score || 0);
  const bn = Number(b.score || 0);
  const isFinal = status === "final";
  const live = status === "live";
  const body = (
    <>
      <div className={`bug-tag ${live ? "live" : isFinal ? "final" : ""}`}>
        {live ? <span className="bc-live-dot" aria-hidden="true" style={{ marginRight: 8 }} /> : null}
        {tag || (live ? "Live" : isFinal ? "Final" : "Draft")}
      </div>
      <div className="bug-teams">
        <div className={`bug-team ${isFinal && an < bn ? "dim" : ""}`}>
          <span className="bug-name">{a.name}</span>
          <FlashNumber as="span" className="bug-score" value={an} />
        </div>
        <div className={`bug-team ${isFinal && bn < an ? "dim" : ""}`}>
          <span className="bug-name">{b.name}</span>
          <FlashNumber as="span" className="bug-score" value={bn} />
        </div>
      </div>
      <div className="bug-side">{children}</div>
    </>
  );
  const cls = `bug reveal ${live ? "is-live" : ""}`;
  const style = { "--i": index };
  return href ? (
    <Link href={href} className={cls} style={style}>{body}</Link>
  ) : (
    <div className={cls} style={style}>{body}</div>
  );
}
