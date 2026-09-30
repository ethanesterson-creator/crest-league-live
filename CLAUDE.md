# Crest League Live

Live sports-scoring app for Camp Bauercrest. Next.js 16 (App Router, React 19) +
Tailwind v4, all client-side data via `@supabase/supabase-js` (no server routes,
no ORM). Deployed on Vercel. Everything is a `"use client"` page — there is no
SSR/RSC data fetching in this app.

Currently closed for the offseason: `OFF_SEASON = true` in
[src/app/layout.js](src/app/layout.js) replaces every route with a static
"see you next summer" screen. Flip it back to `false` to reopen.

## Modes

The app has two parallel modes, toggled via `app_settings.mode` and read
everywhere through [src/lib/useAppMode.js](src/lib/useAppMode.js):

- **`league`** — the regular camp league season, split into `session` `s1` /
  `s2`.
- **`color_war`** — Color War, teams are `cw_blue_name` / `cw_white_name`
  (with logos) instead of league teams.

Most tables carry `season` (`league` / `cw`) and `session` (`s1` / `s2`)
columns so both modes and both sessions coexist in the same tables.

## Sports

Per-sport clock/scoring config lives in
[src/lib/sportRules.js](src/lib/sportRules.js): hoop, soccer, softball,
volleyball, football, speedball, euro, hockey, kickball, newcomb. `hoop` has
aliases (`basketball`, `bb`, `hoops`).

## Pages

- `/` — home / league setup entry
- `/admin` — the control panel: live scoring, rosters, trades, points rules,
  Color War switch, Season/Banquet display-mode switch, CSV/player-card
  exports. JSX split into presentational components under
  `src/app/admin/components/` (state/handlers all stay in `page.js`,
  ~1090 lines) — still the largest page, but no longer one giant file.
- `/live/[id]` — the live in-game scoring UI (phones, courtside). Note: the
  clock is deliberately isolated into its own `ClockButton` component (see
  comment at src/app/live/[id]/page.js:110) after a real bug where the whole
  page re-rendered 4x/second and ate taps. Any future "make it live-update"
  work elsewhere in the app should follow this same isolation pattern instead
  of ticking state at the top of a big component.
- `/display` + `ColorWarBoard.jsx` — the TV/projector board. Polls every 15s
  via `loadAll()`, also re-renders every 1s for the clock.
- `/standings`, `/leaders`, `/awards`, `/highlights`, `/past-games(/[id])`,
  `/player/[id]`, `/post(/[id])` — public-facing views.
- `/install` — PWA install instructions.

## Supabase

Project: `cgalbloauxkmtntfxjxq.supabase.co`. Free tier — **no automatic
backups**. Only the anon key is in `.env.local`; no service-role key, so
schema introspection / migrations must go through the Supabase dashboard SQL
editor, not this repo.

No `supabase/migrations` are tracked — schema changes currently happen by
hand in the dashboard and aren't versioned anywhere. Worth fixing.

### Tables (columns as observed empirically via REST, Aug 2026 — not a formal schema dump)

| table | rows (Aug 2026) | notes |
|---|---|---|
| `players` | 164 | `id, first_name, last_name, league_id, team_name, s1_team, bunk, active_session, departed, role` |
| `games` | 201 | legacy/summary table, overlaps with `live_games` |
| `live_games` | 200 | the live scoring row per game: `status` (`active`/`final`), `score_a/b`, `sport`, `season`, `session`, `played_on`, `timer_running`, `updated_at` |
| `live_events` | 9,414 | every stat delta ever logged: `game_id, player_id, stat_key, delta, event_type`. **No `sport` column** — despite this table's row once listing one, that was wrong and broke `/player/[id]` and admin's player-card export for an entire season before being caught and fixed (see git log). Get an event's sport via its `game_id` → `live_games.sport`, never `live_events.sport`. |
| `game_roster` | 5,926 | who played in which game: `game_id, player_id, player_name, team_side, team_name, is_captain, is_playing` |
| `standings` | 28 | per league+sport+team: `wins, losses, points_for/against, league_points` |
| `player_totals` | 838 | aggregated stat totals: `league_id, sport, player_id, stat_key, value, session` |
| `non_game_points` | 8 | manual point adjustments outside games |
| `points_rules` | 148 | per league+sport+level config: `win_points, default_mode, clock_enabled, stat_keys, score_buttons` |
| `leagues` | 4 | seniors / juniors / sophomores / crest_cup |
| `highlights` | 0 | currently empty |
| `app_settings` | 1 (id=1) | single-row global config: mode, session, CW team names/logos, `display_mode` (`season`/`banquet` — controls the `/display` board's scene set, see `supabase/migrations/0003_display_mode.sql`) |

## Auth model

There is no Supabase Auth for regular use — `/live/[id]`, `/post`,
`/post/[id]`, `/highlights`, and deleting an unfinalized game from `/` all
write with no login, by design (counselors just use a link). Only `/admin`
requires signing in, via `supabase.auth.signInWithPassword` against a fixed
account (`admin@crest-league.internal` — see `src/app/admin/page.js`).
`supabase/migrations/0001_harden_admin_access.sql` restricts the
admin-exclusive RPCs (`rebuild_leaderboards`, `admin_reset_season`,
`admin_clear_snapshots`, `admin_delete_finalized_game`) and table writes
(`players`, `player_totals`, `app_settings`, `standings`, `points_rules`,
`leagues`, `games`) to that authenticated session. Everything else stays
anon-writable on purpose — don't "fix" that without re-checking which
pages depend on it staying open. Confirmed working as of Aug 2026 via
`scripts/verify-admin-lockdown.mjs`.

## Schema changes

As of Aug 2026, schema/policy changes are tracked as numbered files in
`supabase/migrations/`, applied by hand via the Supabase SQL editor (no
service-role key or CLI link exists yet — see `supabase/README.md` for how
to set that up). Before this, changes happened directly in the dashboard
with no record anywhere. Going forward: write the SQL as a new
`NNNN_description.sql` file here first, then run it in the dashboard —
that gives every schema change a reviewable diff instead of vanishing
after being clicked through once.

## Data safety

This DB holds real data about real campers (minors) — names, teams, stats.
Free tier has no backup/restore. Treat any write/delete against it as
irreversible. The season that just ended (summer 2026) must be preserved
as-is: readable for reference, never modified or deleted, even though the
app itself is closed. Before any schema change or bulk-write script, take an
explicit export first.

## Known architectural pattern (mostly fixed)

Several pages used to load data via long chains of **sequential
`await supabase.from(...)`** calls instead of parallelizing independent
queries with `Promise.all`. This was the main cause of the performance
complaints from this season. Fixed as of Aug 2026 in `display/page.js`,
`ColorWarBoard.jsx`, `admin/page.js` (the export/archive functions),
`past-games/[id]/page.js`, `player/[id]/page.js`, `awards/page.js`, and
`leaders/page.js`. If you find another instance, same fix applies: group
the genuinely-independent queries into one `Promise.all`, keep only the
truly dependent ones (needs another query's result, e.g. an id list)
sequential after that.

## Realtime + atomic scoring (fixed)

Two things that used to be open issues here, fixed together in one pass:

- **Realtime live updates.** `src/lib/useRealtimeTable.js` wraps Supabase
  Realtime (`postgres_changes`) and is used by `display/page.js`,
  `ColorWarBoard.jsx`, `useAppMode.js`, and `live/[id]/page.js` so a score
  tap propagates to every open screen in under a second, instead of
  waiting on a 15s poll (each of those now also keeps a slow 60s poll as a
  safety net for a silently-dropped socket). Must be enabled per table in
  the Supabase dashboard (Database → Publications) — currently on for
  `app_settings`, `live_events`, `live_games`.
- **Atomic hoop/goal scoring.** `bumpHoopPoints` / `bumpGoalWithScore`
  (and their undo counterparts) in `live/[id]/page.js` used to fire two
  independent RPCs per tap (`rpc_add_stat` + `rpc_add_score`), which could
  desync the team score and the player's stat total if one failed after
  the other succeeded. Now both writes happen in one Postgres function,
  `rpc_add_score_and_stat` (`supabase/migrations/0002_atomic_score_and_stat.sql`).

Visible feedback for the realtime work was added later
(`src/components/FlashNumber.jsx`): every live score digit on the display
boards and the live scoring page briefly pulses when its value changes,
so an instant update actually *looks* instant instead of looking
identical to a stale number.
