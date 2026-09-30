// Pure CSV-building helpers extracted from admin/page.js's exportPlayerCards
// and exportPlayerStatsCSV -- no state, no Supabase calls, just data in,
// CSV text out. Split out purely to shrink page.js; behavior is unchanged
// (same aggregation logic, same column order, same csvEscape rules).

export function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Player-card data export. One row per player (across BOTH sessions), with
// identity, combined stat totals, best single-game performances, and win
// record. This is the master data file for the imaging team.
export function buildPlayerCardsCSV(players, totals, rosters, games, events) {
  const gameById = {};
  for (const g of games || []) gameById[g.id] = g;

  // combined totals per player: {pid: {"sport stat": value}}
  const totMap = {};
  for (const t of totals || []) {
    const pid = String(t.player_id);
    const key = `${String(t.sport).toUpperCase()} ${String(t.stat_key).toUpperCase()}`;
    totMap[pid] = totMap[pid] || {};
    totMap[pid][key] = (totMap[pid][key] || 0) + Number(t.value || 0);
  }

  // wins per player. Only rows where the player actually played -- a bench
  // player added to the roster pool but never toggled "In" shouldn't be
  // credited with the team's win.
  const winMap = {};
  for (const r of rosters || []) {
    const g = gameById[r.game_id];
    if (!g) continue;
    const won = (r.team_side === "A" && Number(g.score_a) > Number(g.score_b)) ||
                (r.team_side === "B" && Number(g.score_b) > Number(g.score_a));
    if (won) winMap[String(r.player_id)] = (winMap[String(r.player_id)] || 0) + 1;
  }

  // best single game per player: {pid: "5 G · SOCCER"}
  const perGameStat = {};
  for (const e of events || []) {
    const pid = String(e.player_id);
    perGameStat[pid] = perGameStat[pid] || {};
    const gk = e.game_id;
    perGameStat[pid][gk] = perGameStat[pid][gk] || { sport: e.sport, stats: {} };
    const sk = String(e.stat_key).toUpperCase();
    perGameStat[pid][gk].stats[sk] = (perGameStat[pid][gk].stats[sk] || 0) + Number(e.delta || 0);
  }
  const bestGameMap = {};
  for (const pid of Object.keys(perGameStat)) {
    let best = null;
    for (const gk of Object.keys(perGameStat[pid])) {
      const g = perGameStat[pid][gk];
      for (const sk of Object.keys(g.stats)) {
        const v = g.stats[sk];
        if (!best || v > best.value) best = { value: v, stat: sk, sport: String(g.sport).toUpperCase() };
      }
    }
    if (best) bestGameMap[pid] = `${best.value} ${best.stat} · ${best.sport} (single game)`;
  }

  const rows = [];
  for (const p of players || []) {
    const pid = String(p.id);
    const totals2 = totMap[pid] || {};
    const totalsLine = Object.entries(totals2)
      .filter(([k, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");
    rows.push({
      player_id: pid,
      first_name: p.first_name,
      last_name: p.last_name,
      league: p.league_id,
      team: p.team_name,
      bunk: p.bunk,
      sessions: p.active_session === "s2" ? (p.s1_team ? "Both" : "Session 2") : "Session 1",
      total_wins: winMap[pid] || 0,
      best_single_game: bestGameMap[pid] || "",
      all_stat_totals: totalsLine,
    });
  }

  const header = ["player_id", "first_name", "last_name", "league", "team", "bunk", "sessions", "total_wins", "best_single_game", "all_stat_totals"];
  const lines = [header.join(",")];
  for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(","));
  return { csv: lines.join("\n"), count: rows.length };
}

// Wide-format player-stats CSV (one column per sport+stat combo).
export function buildPlayerStatsCSV(players, rules, totals) {
  const norm2 = (s) => String(s ?? "").trim().toLowerCase();
  const statColSet = new Set();

  for (const rr of rules || []) {
    const sport = norm2(rr.sport);
    const keys = String(rr.stat_keys ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    for (const k of keys) statColSet.add(`${sport}_${norm2(k)}`);
  }

  for (const tt of totals || []) {
    statColSet.add(`${norm2(tt.sport)}_${norm2(tt.stat_key)}`);
  }

  const statCols = Array.from(statColSet).sort();

  const totalsMap = new Map();
  for (const t of totals || []) {
    const key = `${norm2(t.league_id)}|${String(t.player_id)}|${norm2(t.sport)}|${norm2(t.stat_key)}`;
    totalsMap.set(key, (totalsMap.get(key) || 0) + Number(t.value || 0));
  }

  const header = ["league_id", "team_name", "player_id", "player_name", ...statCols];
  const lines = [header.join(",")];

  for (const p of players || []) {
    const league = norm2(p.league_id);
    const playerId = String(p.id);
    const playerName =
      `${String(p.first_name ?? "").trim()} ${String(p.last_name ?? "").trim()}`.trim() || playerId;

    const row = {};
    row.league_id = league;
    row.team_name = String(p.team_name ?? "");
    row.player_id = playerId;
    row.player_name = playerName;

    for (const col of statCols) row[col] = 0;
    for (const col of statCols) {
      const [sport, stat] = col.split("_");
      const k = `${league}|${playerId}|${sport}|${stat}`;
      if (totalsMap.has(k)) row[col] = totalsMap.get(k);
    }

    lines.push(header.map((h) => csvEscape(row[h])).join(","));
  }

  return lines.join("\n");
}
