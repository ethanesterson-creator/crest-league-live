"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Reads the current app mode from app_settings. Returns:
//   mode:      'league' | 'color_war'
//   season:    'league' | 'cw'   (the season string used on data rows)
//   isCW:      boolean convenience
//   blueName / whiteName: Color War team display names
//   blueLogo / whiteLogo: storage paths (may be null)
//   loading:   true until first fetch resolves
//   refresh:   re-fetch settings on demand
//
// Every page that shows competition data calls this and filters its queries
// by `season`. In league mode nothing changes vs today.
export function useAppMode() {
  const [settings, setSettings] = useState({
    mode: "league",
    cw_blue_name: "Blue",
    cw_white_name: "White",
    cw_blue_logo: null,
    cw_white_logo: null,
  });
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (data) setSettings(data);
    } catch {
      // default to league on any failure — safest fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Light polling so a mode flip on one device propagates to the display
    // board and any open pages within ~15s without a manual refresh.
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const isCW = settings.mode === "color_war";
  return {
    mode: settings.mode,
    season: isCW ? "cw" : "league",
    isCW,
    blueName: settings.cw_blue_name || "Blue",
    whiteName: settings.cw_white_name || "White",
    blueLogo: settings.cw_blue_logo || null,
    whiteLogo: settings.cw_white_logo || null,
    loading,
    refresh: load,
  };
}