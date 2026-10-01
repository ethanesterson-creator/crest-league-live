"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// Subscribes to Postgres change events on one or more tables and calls
// `onChange` whenever a row changes. Does NOT fetch data itself -- callers
// keep their existing load()/loadAll() functions and just re-run them on
// change, so query/join logic stays in exactly one place per page.
//
// One subscribe per mount -- no manual reconnect-on-error loop here.
// supabase-js's realtime socket already reconnects itself on a dropped
// transport; layering a second "remove the channel and resubscribe" retry
// on top of that fought with its own reconnect state and could spiral
// (confirmed while testing this: sustained CHANNEL_ERROR drove repeated
// channel churn into a stack overflow in the client's internals). Callers
// keep a slow (~60s) polling fallback as the real safety net for whatever
// realtime can't recover from on its own.
//
// `tables` may be a single table name or an array. `filter` (optional) is a
// Postgres changes filter string, e.g. `game_id=eq.${id}`, applied to every
// table in the list.
export function useRealtimeTable(tables, onChange, { filter, enabled = true } = {}) {
  // The subscription itself only needs to be (re)created when tables/filter/
  // enabled change -- but it must always call the CURRENT onChange, not the
  // one captured when it first subscribed (the display board already had a
  // stale-closure bug from this exact shape once, on its old poll effect).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!enabled) return;
    const tableList = Array.isArray(tables) ? tables : [tables];
    if (!tableList.length || tableList.some((t) => !t)) return;

    const channelName = `rt:${tableList.join(",")}:${filter || "all"}`;
    const channel = supabase.channel(channelName);

    for (const table of tableList) {
      const config = { event: "*", schema: "public", table };
      if (filter) config.filter = filter;
      channel.on("postgres_changes", config, () => {
        onChangeRef.current();
      });
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(tables) ? tables.join(",") : tables, filter, enabled]);
}
