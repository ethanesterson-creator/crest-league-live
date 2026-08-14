-- Crest League Live — lock down admin-only operations to a real login.
--
-- Context: the app has never used real Supabase Auth. Every read AND write
-- goes through the public `anon` key (visible in the browser's network tab
-- / JS bundle on every page load). The old "admin password" was only a
-- client-side JS check on the /admin PAGE — it never restricted what the
-- database itself would accept from anyone calling the API directly.
--
-- Scope, deliberately narrow: live scoring (/live/[id], /post, /highlights,
-- and creating/deleting unfinalized games from the home page) has always
-- worked with NO login — counselors just use a link, by design. That stays
-- exactly as-is; this script does not touch it. Only the operations that
-- are EXCLUSIVELY reachable from the password-gated /admin page get locked
-- to a real authenticated session:
--   - season-destroying RPCs: rebuild_leaderboards, admin_reset_season,
--     admin_clear_snapshots, admin_delete_finalized_game
--   - direct table writes that only admin/page.js ever performs: players,
--     player_totals, app_settings, standings, plus points_rules/leagues/
--     games which no part of the app writes to at all today
--
-- NOT touched (still open to anon, exactly like today): live_games,
-- live_events, game_roster, non_game_points, highlights, and the
-- rpc_add_score / rpc_add_stat / finalize_game / delete_unfinalized_game
-- functions — these are what /live/[id], /post, /post/[id], and the home
-- page use with no login, and that's staying that way on purpose.
--
-- The app code now signs the /admin panel in with a real Supabase Auth
-- session (see src/app/admin/page.js, ADMIN_AUTH_EMAIL). This script makes
-- that session actually mean something at the database level for the
-- things that matter.
--
-- HOW TO RUN THIS:
--   1. Supabase dashboard → Authentication → Users → Add user.
--      Email:    admin@crest-league.internal
--      Password: pick a new one. (Do not reuse the old NEXT_PUBLIC_ADMIN_PASSWORD
--                 value from before this fix — it was shipped in the public JS
--                 bundle for as long as this app was deployed with it, so treat
--                 it as burned, not a real secret, even after this file stops
--                 referencing it.)
--      Auto-confirm the user (no real inbox exists at that address).
--   2. Supabase dashboard → SQL Editor → paste STEP 1 below, run it, and
--      read the output. It lists every existing policy on the tables this
--      script touches. If you see any policy that already allows INSERT/
--      UPDATE/DELETE for role `anon` or `public`, note its name — Postgres
--      OR's multiple policies together, so a leftover permissive policy
--      would silently keep the door open even after STEP 2. Send me the
--      output if you want help interpreting it.
--   3. Run STEP 2. Safe to re-run any time (DROP POLICY IF EXISTS
--      throughout).
--   4. Tell me it's done and I'll verify sign-in + a couple of writes
--      before you rely on it.

-- ============================================================================
-- STEP 1 — diagnostic only, changes nothing. Run this first and read it.
-- ============================================================================
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where tablename in (
  'players', 'games', 'standings', 'player_totals',
  'points_rules', 'leagues', 'app_settings'
)
order by tablename, cmd;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'rebuild_leaderboards', 'admin_clear_snapshots',
    'admin_reset_season', 'admin_delete_finalized_game'
  );

-- ============================================================================
-- STEP 2 — the actual lockdown. Only admin-exclusive surface, per the scope
-- note above. Live scoring is untouched.
-- ============================================================================

-- ---- RPCs that only admin/page.js ever calls. Some of these (e.g.
-- rebuild_leaderboards) have more than one overload with different
-- argument lists -- the bare function name is ambiguous to REVOKE/GRANT,
-- so this loops over every actual overload by OID instead of guessing
-- signatures by hand. ----
do $$
declare
  r record;
  fn_names text[] := array[
    'rebuild_leaderboards', 'admin_clear_snapshots',
    'admin_reset_season', 'admin_delete_finalized_game'
  ];
  fn text;
begin
  foreach fn in array fn_names loop
    for r in
      select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    loop
      execute format('revoke execute on function %s from anon, public;', r.sig);
      execute format('grant execute on function %s to authenticated;', r.sig);
    end loop;
  end loop;
end $$;

-- ---- Tables that only admin/page.js writes to (or that nothing in the app
-- writes to at all). Reads stay open to anon — public pages need those.
-- Writes become authenticated-only. ----
do $$
declare
  t text;
  tables text[] := array[
    'players', 'games', 'standings', 'player_totals',
    'points_rules', 'leagues', 'app_settings'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists public_read on public.%I;', t);
    execute format(
      'create policy public_read on public.%I for select to anon, authenticated using (true);',
      t
    );

    execute format('drop policy if exists admin_write on public.%I;', t);
    execute format(
      'create policy admin_write on public.%I for insert to authenticated with check (true);',
      t
    );
    execute format('drop policy if exists admin_update on public.%I;', t);
    execute format(
      'create policy admin_update on public.%I for update to authenticated using (true) with check (true);',
      t
    );
    execute format('drop policy if exists admin_delete on public.%I;', t);
    execute format(
      'create policy admin_delete on public.%I for delete to authenticated using (true);',
      t
    );
  end loop;
end $$;
