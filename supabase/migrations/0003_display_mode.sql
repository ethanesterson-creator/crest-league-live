-- ============================================================================
-- 0003_display_mode.sql
-- Adds a real, admin-controlled toggle for the TV/projector display board's
-- scene set, replacing the hardcoded `const BANQUET = true;` that was left
-- in src/app/display/page.js (it silently pinned the board to banquet-only
-- scenes — no live scores, no camp standings — regardless of season state).
--
-- 'season'  = normal in-season board (camp standings, live games, per-game
--             leaders, awards race, league stat leaders, highlights)
-- 'banquet' = end-of-summer board (champions, final awards, season recap,
--             camper spotlight, highlights)
-- ============================================================================

alter table app_settings
  add column if not exists display_mode text not null default 'season';

alter table app_settings
  drop constraint if exists app_settings_display_mode_check;

alter table app_settings
  add constraint app_settings_display_mode_check
  check (display_mode in ('season', 'banquet'));

-- Existing single row (id = 1) starts in 'season' mode by default (the
-- column default above already covers this on the existing row via the
-- add column default, but stated explicitly for clarity/idempotency).
update app_settings set display_mode = 'season' where id = 1 and display_mode is null;
