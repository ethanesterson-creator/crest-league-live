"use client";

import { useEffect, useRef, useState } from "react";

// Briefly highlights a number (or any inline value) when it changes — the
// visible "this just moved" signal for realtime score updates. Before this,
// a score tap propagated instantly via Supabase Realtime but looked
// identical to a stale number just sitting there; nothing on screen showed
// that anything had happened. Pure CSS animation, respects
// prefers-reduced-motion (see .bc-flash in globals.css), and never touches
// layout (no width/height change, so it can't shift neighboring content).
export default function FlashNumber({ value, className = "", as: Tag = "span" }) {
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef(value);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    // Never flash on first mount (that's not a "change", it's initial data
    // loading) — only on a real value-to-value transition after that.
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      prevRef.current = value;
      return;
    }
    if (prevRef.current !== value) {
      prevRef.current = value;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 650);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <Tag className={`${className} ${flashing ? "bc-flash" : ""}`}>
      {value}
    </Tag>
  );
}
