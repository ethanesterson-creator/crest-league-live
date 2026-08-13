// Read-only export of every table to local JSON files. Run this before any
// offseason schema/data work, and again at the end of each future season —
// free-tier Supabase has no backups, so this file IS the backup.
//
// Usage: node scripts/backup-season.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local.
// Writes to backups/<date>/<table>.json (gitignored — never commit these).

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const raw = readFileSync(path.join(root, ".env.local"), "utf8");
  const env = {};
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TABLES = [
  "players", "games", "live_games", "live_events", "game_roster",
  "standings", "player_totals", "non_game_points", "points_rules",
  "leagues", "highlights", "app_settings",
];

const PAGE_SIZE = 1000;

async function fetchAll(table) {
  let rows = [];
  let from = 0;
  while (true) {
    const res = await fetch(`${URL}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE_SIZE - 1}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`${table}: HTTP ${res.status} — ${await res.text()}`);
    }
    const page = await res.json();
    rows = rows.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.join(root, "backups", stamp);
  mkdirSync(outDir, { recursive: true });

  const summary = {};
  for (const table of TABLES) {
    process.stdout.write(`Exporting ${table}... `);
    const rows = await fetchAll(table);
    writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
    summary[table] = rows.length;
    console.log(`${rows.length} rows`);
  }

  writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nDone. Backup written to backups/${stamp}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
