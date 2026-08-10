create table public.active_match_drafts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  format public.match_format not null,
  team_a_user_ids uuid[] not null,
  team_b_user_ids uuid[] not null,
  games jsonb not null default '[]'::jsonb,
  submitted_match_id uuid references public.matches(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index active_match_drafts_visible_idx
  on public.active_match_drafts (group_id, expires_at)
  where submitted_match_id is null;

create index active_match_drafts_creator_idx
  on public.active_match_drafts (created_by_user_id, expires_at)
  where submitted_match_id is null;

grant select, insert, update, delete on public.active_match_drafts to authenticated;
grant all on public.active_match_drafts to service_role;

alter table public.active_match_drafts enable row level security;

create policy "creators and participants can read active drafts"
  on public.active_match_drafts for select to authenticated
  using (
    submitted_match_id is null
    and expires_at > now()
    and (
      created_by_user_id = auth.uid()
      or auth.uid() = any(team_a_user_ids)
      or auth.uid() = any(team_b_user_ids)
    )
  );

create policy "active members can create own active drafts"
  on public.active_match_drafts for insert to authenticated
  with check (
    created_by_user_id = auth.uid()
    and exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "creators can update own active drafts"
  on public.active_match_drafts for update to authenticated
  using (
    created_by_user_id = auth.uid()
    and exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  )
  with check (created_by_user_id = auth.uid());

create policy "creators can delete own active drafts"
  on public.active_match_drafts for delete to authenticated
  using (created_by_user_id = auth.uid());