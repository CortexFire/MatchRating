-- Contract migration. Apply only after every production group has completed a
-- prefix-zero rebuild with the enriched incremental worker.

alter table public.rating_events
  alter column game_id set not null,
  alter column game_number set not null,
  alter column occurred_at set not null,
  alter column format set not null,
  alter column team set not null,
  alter column expected_score set not null,
  alter column actual_score set not null,
  alter column points_for set not null,
  alter column points_against set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rating_events'::regclass
      and conname = 'rating_events_expected_score_check'
  ) then
    alter table public.rating_events
      add constraint rating_events_expected_score_check
      check (expected_score between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rating_events'::regclass
      and conname = 'rating_events_actual_score_check'
  ) then
    alter table public.rating_events
      add constraint rating_events_actual_score_check
      check (actual_score in (0, 1));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rating_events'::regclass
      and conname = 'rating_events_points_check'
  ) then
    alter table public.rating_events
      add constraint rating_events_points_check
      check (points_for >= 0 and points_against >= 0 and game_number > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rating_events'::regclass
      and conname = 'rating_events_games_played_step_check'
  ) then
    alter table public.rating_events
      add constraint rating_events_games_played_step_check
      check (after_games_played = before_games_played + 1);
  end if;
end;
$$;

alter table public.rating_events
  drop constraint if exists rating_events_group_id_sequence_user_id_key;

create unique index if not exists rating_events_group_game_user_key
  on public.rating_events (group_id, game_id, user_id);

create unique index if not exists rating_events_group_sequence_key
  on public.rating_events (group_id, sequence);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rating_events'::regclass
      and conname = 'rating_events_group_game_user_key'
  ) then
    alter table public.rating_events
      add constraint rating_events_group_game_user_key
      unique using index rating_events_group_game_user_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rating_events'::regclass
      and conname = 'rating_events_group_sequence_key'
  ) then
    alter table public.rating_events
      add constraint rating_events_group_sequence_key
      unique using index rating_events_group_sequence_key;
  end if;
end;
$$;

revoke all on function public.begin_rating_rebuild(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_rating_rebuild(uuid, bigint, jsonb, jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.begin_incremental_rating_rebuild(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_incremental_rating_rebuild(uuid, bigint, integer, jsonb, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.begin_incremental_rating_rebuild(uuid, uuid) to service_role;
grant execute on function public.apply_incremental_rating_rebuild(uuid, bigint, integer, jsonb, jsonb) to service_role;
