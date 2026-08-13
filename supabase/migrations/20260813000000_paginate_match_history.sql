create extension if not exists pg_trgm with schema extensions;

create index rating_events_revision_idx
  on public.rating_events (revision_id);

create index matches_active_submitted_idx
  on public.matches (submitted_at desc, id desc)
  where active_revision_id is not null;

create index profiles_display_name_trgm_idx
  on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops);

create index groups_name_trgm_idx
  on public.groups using gin (lower(name) extensions.gin_trgm_ops);

create or replace function public.list_match_history_page(
  p_group_id uuid default null,
  p_status public.match_status default null,
  p_search text default null,
  p_before_submitted_at timestamptz default null,
  p_before_match_id uuid default null,
  p_limit integer default 21
)
returns table (
  id uuid,
  group_id uuid,
  active_revision_id uuid,
  status public.match_status,
  submitted_at timestamptz,
  review_started_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_search text := lower(nullif(trim(p_search), ''));
  v_pattern text;
begin
  if v_actor is null then
    raise exception using errcode = 'MR401', message = 'Authentication required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 51 then
    raise exception using errcode = 'MRVAL', message = 'History limit must be between 1 and 51';
  end if;

  if (p_before_submitted_at is null) <> (p_before_match_id is null) then
    raise exception using errcode = 'MRVAL', message = 'History cursor is incomplete';
  end if;

  if p_group_id is not null and not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.user_id = v_actor
      and gm.status = 'active'
      and gm.left_at is null
  ) then
    raise exception using errcode = 'MR403', message = 'Not an active group member';
  end if;

  if v_search is not null then
    v_pattern := '%'
      || replace(
        replace(
          replace(v_search, E'\\', E'\\\\'),
          '%', E'\\%'
        ),
        '_', E'\\_'
      )
      || '%';
  end if;

  return query
  select
    m.id,
    m.group_id,
    m.active_revision_id,
    m.status,
    m.submitted_at,
    m.review_started_at
  from public.matches m
  join public.match_revisions mr on mr.id = m.active_revision_id
  join public.groups g on g.id = m.group_id
  where m.active_revision_id is not null
    and (
      (
        p_group_id is not null
        and m.group_id = p_group_id
      )
      or (
        p_group_id is null
        and exists (
          select 1
          from public.group_memberships gm
          where gm.group_id = m.group_id
            and gm.user_id = v_actor
            and gm.status = 'active'
            and gm.left_at is null
        )
        and exists (
          select 1
          from public.match_participants actor_participant
          where actor_participant.revision_id = m.active_revision_id
            and actor_participant.user_id = v_actor
        )
      )
    )
    and (p_status is null or m.status = p_status)
    and (
      p_before_submitted_at is null
      or (m.submitted_at, m.id) < (p_before_submitted_at, p_before_match_id)
    )
    and (
      v_search is null
      or lower(m.status::text) like v_pattern escape E'\\'
      or lower(mr.format::text) like v_pattern escape E'\\'
      or lower(
        case m.status
          when 'pending_confirmation' then 'Awaiting review'
          when 'confirmed' then 'Accepted'
          when 'disputed' then 'Disputed'
        end
      ) like v_pattern escape E'\\'
      or lower(g.name) like v_pattern escape E'\\'
      or exists (
        select 1
        from public.match_participants participant
        join public.profiles profile on profile.id = participant.user_id
        where participant.revision_id = m.active_revision_id
          and lower(profile.display_name) like v_pattern escape E'\\'
      )
    )
  order by m.submitted_at desc, m.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_match_history_page(uuid, public.match_status, text, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_match_history_page(uuid, public.match_status, text, timestamptz, uuid, integer)
  to authenticated;
