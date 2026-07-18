"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Reads the current app mode from app_settings.
//
// Refresh-stability: the last confirmed settings are cached in localStorage so
// a page reload starts from the CORRECT mode instead of flashing league (the
// old default) while the async read is in flight. Without this, refreshing
// during Color War could momentarily render league and load league data.

const CACHE_KEY = "crest_app_settings_v1";

const DEFAULTS = {
  mode: "league",
  current_session: "s1",
  cw_blue_name: "Blue",
  cw_white_name: "White",
  cw_blue_logo: null,
  cw_white_logo: null,
};

function readCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(s) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {}
}

export function useAppMode() {
  // Seed from cache when available so refreshes are stable; only true first-
  // ever visit starts from league defaults.
  const [settings, setSettings] = useState(() => readCache() || DEFAULTS);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      // Only overwrite state on a real successful read. A transient network
      // failure must NOT knock us back to league — we keep the cached mode.
      if (!error && data) {
        setSettings(data);
        writeCache(data);
      }
    } catch {
      // keep whatever we already have (cache or last good) — never force league
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCW = settings.mode === "color_war";
  return {
    mode: settings.mode,
    season: isCW ? "cw" : "league",
    session: settings.current_session || "s1",
    isCW,
    blueName: settings.cw_blue_name || "Blue",
    whiteName: settings.cw_white_name || "White",
    blueLogo: settings.cw_blue_logo || null,
    whiteLogo: settings.cw_white_logo || null,
    loading,
    refresh: load,
  };
}