"use client";

import { useCallback, useState } from "react";

// Drop-in replacement for `const [err, setErr] = useState("")`, the error-
// banner pattern used on every page. Setting a non-empty value also pushes
// an ntfy alert -- so "a button didn't work and nobody told me about it"
// reaches a phone instead of only ever showing as a red banner a counselor
// might not mention. Clearing the error (setErr("")) never notifies.
//
// Deduped per page+message for a minute so a user hammering a broken button
// (or a sustained outage re-triggering the same catch block repeatedly)
// sends one alert, not a flood. Does NOT support the useState functional-
// update form (setErr(prev => ...)) -- no call site in this app uses it.

const NTFY_TOPIC = "crest-league-errors";
const DEDUP_WINDOW_MS = 60000;

// Module-level (not per-component) so dedup holds across remounts of the
// same page within a tab, e.g. React Strict Mode or a route revisit.
const recentlySent = new Map();

export async function notifyError(message) {
  try {
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const key = `${path}:${message}`;
    const now = Date.now();
    const last = recentlySent.get(key);
    if (last && now - last < DEDUP_WINDOW_MS) return;
    recentlySent.set(key, now);

    // JSON body format (not headers) -- see notifyGame.js: HTTP headers
    // must be Latin-1 only, and error messages can contain anything.
    await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: `Error on ${path || "Crest League Live"}`,
        message: String(message),
        tags: ["warning"],
        priority: 4,
      }),
    });
  } catch {
    // Never let a notification failure affect the error banner itself.
  }
}

export function useNotifyingErr(initial = "") {
  const [err, setErrState] = useState(initial);
  const setErr = useCallback((value) => {
    setErrState(value);
    if (value) notifyError(value);
  }, []);
  return [err, setErr];
}
