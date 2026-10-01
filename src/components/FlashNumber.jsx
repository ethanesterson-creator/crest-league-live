"use client";

import { useEffect, useRef, useState } from "react";

// A scoreboard numeral that rolls. Each digit is a 0-9 column that slides to
// its value like a mechanical counter, on first load (counting up from 0) and
// on every real change after that, with a short glow so a score update is
// impossible to miss across a room. Non-integer or negative values fall back
// to plain text. Pure CSS transitions on transform; no timers, no state at the
// page level, so it is safe inside the /live scoreboard (see ClockButton note
// in live/[id]/page.js about never ticking state at the top of a big
// component). prefers-reduced-motion collapses the roll to an instant swap
// (see globals.css).
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ d, delay }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setShown(d)));
    return () => cancelAnimationFrame(t);
  }, [d]);
  return (
    <span className="rd" aria-hidden="true">
      <span
        className="rd-col"
        style={{ transform: `translateY(-${shown}em)`, transitionDelay: `${delay}ms` }}
      >
        {DIGITS.map((n) => <span key={n}>{n}</span>)}
      </span>
    </span>
  );
}

export default function FlashNumber({ value, className = "", as: Tag = "span" }) {
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef(value);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    // Never flash on first mount: that is initial data, not a change.
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      prevRef.current = value;
      return;
    }
    if (prevRef.current !== value) {
      prevRef.current = value;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 950);
      return () => clearTimeout(t);
    }
  }, [value]);

  const n = Number(value);
  const rollable = Number.isInteger(n) && n >= 0 && String(value).trim() !== "";

  if (!rollable) {
    return (
      <Tag className={`${className} ${flashing ? "bc-flash" : ""}`}>
        {value}
      </Tag>
    );
  }

  const str = String(n);
  const len = str.length;
  return (
    <Tag className={className}>
      <span className={`rn ${flashing ? "is-flash" : ""}`} role="img" aria-label={String(n)}>
        {str.split("").map((ch, i) => (
          // keyed from the right so existing columns persist when 9 -> 10
          <Digit key={len - i} d={Number(ch)} delay={(len - 1 - i) * 60} />
        ))}
      </span>
    </Tag>
  );
}
