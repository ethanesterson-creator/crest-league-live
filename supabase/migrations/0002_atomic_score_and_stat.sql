-- Crest League Live — atomic combined score+stat write for hoop/goal taps.
--
-- Context: live/[id]/page.js's bumpHoopPoints/bumpGoalWithScore (and their
-- undo counterparts) each fired two independent RPCs for one tap --
-- rpc_add_score and rpc_add_stat -- with separate 3-try retries and no
-- shared transaction. If one permanently failed after retries while the
-- other succeeded, the team score and the player's stat total went out of
-- sync. This has been a documented open issue since early in the project
-- (see the comment above bumpHoopPoints in live/[id]/page.js).
--
-- This adds one combined RPC that does both writes in a single plpgsql
-- function body -- a Postgres function is implicitly one transaction, so
-- either both writes land or neither does. It reproduces rpc_add_score's
-- and rpc_add_stat's existing bodies exactly (same live_games update, same
-- live_events inserts, same upper()/lower() normalization), just combined.
--
-- p_side/p_score_delta are nullable so a tap that's already at zero score
-- (undoHoopPoints/undoGoalWithScore's existing "nothing to undo on the
-- score side" case) can still log the stat-undo event without touching
-- live_games at all.
--
-- rpc_add_score and rpc_add_stat themselves are untouched and stay in use
-- by bumpScore/undoScore and bumpStat/undoStat, which only ever write one
-- side and were never at risk of this desync.
--
-- HOW TO RUN THIS: Supabase dashboard → SQL Editor → paste and run. Safe
-- to re-run (create or replace).

create or replace function public.rpc_add_score_and_stat(
  p_game_id uuid,
  p_side text,
  p_score_delta integer,
  p_player_id text,
  p_team_name text,
  p_stat_key text,
  p_stat_delta integer
)
returns void
language plpgsql
as $$
begin
  -- Score half (rpc_add_score's body), skipped entirely when p_side is
  -- null -- see note above on the "already at zero" undo case.
  if p_side is not null then
    if upper(p_side) = 'A' then
      update public.live_games
      set score_a = coalesce(score_a, 0) + coalesce(p_score_delta, 0),
          updated_at = now()
      where id = p_game_id;
    elsif upper(p_side) = 'B' then
      update public.live_games
      set score_b = coalesce(score_b, 0) + coalesce(p_score_delta, 0),
          updated_at = now()
      where id = p_game_id;
    else
      raise exception 'rpc_add_score_and_stat: p_side must be A or B (got %)', p_side;
    end if;

    insert into public.live_events (game_id, event_type, side, delta, created_at)
    values (p_game_id, 'score', upper(p_side), p_score_delta, now());
  end if;

  -- Stat half (rpc_add_stat's body), always runs. live_events has no
  -- player_name column, matching rpc_add_stat -- not inserted here either.
  insert into public.live_events (
    game_id, event_type, delta, player_id, team_name, stat_key, created_at
  )
  values (
    p_game_id, 'stat', p_stat_delta, p_player_id, p_team_name, lower(p_stat_key), now()
  );
end;
$$;

-- rpc_add_score/rpc_add_stat are anon-callable (live scoring has no login,
-- by design -- see supabase/migrations/0001_harden_admin_access.sql). This
-- combined RPC replaces two of their call sites, so it needs the same access.
grant execute on function public.rpc_add_score_and_stat(uuid, text, integer, text, text, text, integer)
  to anon, authenticated;
