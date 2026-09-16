"use client";

import { useEffect } from "react";
import { notifyError } from "@/lib/useNotifyingErr";

// Catches crashes the per-page [err, setErr] banners can't: an uncaught
// exception or unhandled promise rejection that never reaches a try/catch,
// where nothing renders a red error at all -- the "blank/frozen screen"
// case. Routes through the same notifyError (same topic, same dedup) as
// useNotifyingErr, so it's one alert stream, not two.
export default function GlobalErrorReporter() {
  useEffect(() => {
    function onError(e) {
      notifyError(`Uncaught error: ${e?.error?.message || e?.message || "unknown error"}`);
    }
    function onRejection(e) {
      const reason = e?.reason;
      notifyError(`Unhandled promise rejection: ${reason?.message || String(reason ?? "unknown")}`);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
