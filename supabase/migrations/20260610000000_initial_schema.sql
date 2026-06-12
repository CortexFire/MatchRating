create extension if not exists "pgcrypto";

create type public.group_role as enum ('owner', 'admin', 'member');
create type public.membership_status as enum ('active', 'left');
create type public.match_status as enum ('pending_confirmation', 'confirmed', 'disputed');
create type public.match_format as enum ('singles', 'doubles');
create type public.team_code as enum ('A', 'B');
create type public.confirmation_action as enum ('confirmed', 'disputed');
create type public.rebuild_status as enum ('queued', 'running', 'completed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null default 'member',
  status public.membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (group_id, user_id)
);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token_hash text not null unique,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.group_invites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (invite_id, user_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  active_revision_id uuid,
  status public.match_status not null default 'pending_confirmation',
  submitted_at timestamptz not null default now()
);

create table public.match_revisions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  version integer not null check (version > 0),
  submitted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  format public.match_format not null,
  reason text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (match_id, version)
);

alter table public.matches
  add constraint matches_active_revision_fk
  foreign key (active_revision_id) references public.match_revisions(id) on delete set null;

create table public.match_participants (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.match_revisions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  team public.team_code not null,
  slot integer not null check (slot between 1 and 2),
  unique (revision_id, user_id),
  unique (revision_id, team, slot)
);

create table public.match_games (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.match_revisions(id) on delete cascade,
  game_number integer not null check (game_number > 0),
  team_a_score integer not null check (team_a_score >= 0),
  team_b_score integer not null check (team_b_score >= 0),
  winner_team public.team_code not null,
  unique (revision_id, game_number),
  check (team_a_score <> team_b_score)
);

create table public.match_confirmations (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.match_revisions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  action public.confirmation_action not null,
  note text,
  created_at timestamptz not null default now(),
  unique (revision_id, user_id)
);

create table public.group_rating_states (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating numeric(10, 4) not null default 1500,
  rd numeric(10, 4) not null default 350,
  volatility numeric(10, 8) not null default 0.06,
  games_played integer not null default 0,
  rank integer,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.rating_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  revision_id uuid not null references public.match_revisions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sequence integer not null,
  before_rating numeric(10, 4) not null,
  before_rd numeric(10, 4) not null,
  before_volatility numeric(10, 8) not null,
  after_rating numeric(10, 4) not null,
  after_rd numeric(10, 4) not null,
  after_volatility numeric(10, 8) not null,
  created_at timestamptz not null default now(),
  unique (group_id, sequence, user_id)
);

create table public.rating_rebuild_jobs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_match_id uuid references public.matches(id) on delete set null,
  status public.rebuild_status not null default 'queued',
  cursor_match_id uuid references public.matches(id) on delete set null,
  error text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index group_memberships_user_idx on public.group_memberships (user_id, status);
create index group_rating_states_rank_idx on public.group_rating_states (group_id, rank, rating desc);
create index matches_group_submitted_idx on public.matches (group_id, submitted_at, id);
create index match_revisions_match_idx on public.match_revisions (match_id, version desc);
create index match_participants_user_idx on public.match_participants (user_id, revision_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.groups to authenticated;
grant select, insert, update on public.group_memberships to authenticated;
grant select, insert on public.group_invites to authenticated;
grant select, insert on public.group_invite_redemptions to authenticated;
grant select, insert, update on public.matches to authenticated;
grant select, insert on public.match_revisions to authenticated;
grant select, insert on public.match_participants to authenticated;
grant select, insert on public.match_games to authenticated;
grant select, insert on public.match_confirmations to authenticated;
grant select on public.group_rating_states to authenticated;
grant select on public.rating_events to authenticated;
grant select, insert on public.rating_rebuild_jobs to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_invite_redemptions enable row level security;
alter table public.matches enable row level security;
alter table public.match_revisions enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_games enable row level security;
alter table public.match_confirmations enable row level security;
alter table public.group_rating_states enable row level security;
alter table public.rating_events enable row level security;
alter table public.rating_rebuild_jobs enable row level security;

create policy "profiles are visible to signed-in users"
  on public.profiles for select to authenticated
  using (true);

create policy "users can insert own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "users can update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "members can read groups"
  on public.groups for select to authenticated
  using (
    exists (
      select 1 from public.group_memberships gm
      where gm.group_id = id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "signed-in users can create groups"
  on public.groups for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "members can read memberships"
  on public.group_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "users can create own membership"
  on public.group_memberships for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can leave own membership"
  on public.group_memberships for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "members can read invites"
  on public.group_invites for select to authenticated
  using (
    exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "members can create invites"
  on public.group_invites for insert to authenticated
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

create policy "members can read group matches"
  on public.matches for select to authenticated
  using (
    exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "members can insert group matches"
  on public.matches for insert to authenticated
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

create policy "members can read match revisions"
  on public.match_revisions for select to authenticated
  using (
    exists (
      select 1
      from public.matches m
      join public.group_memberships gm on gm.group_id = m.group_id
      where m.id = match_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "members can insert match revisions"
  on public.match_revisions for insert to authenticated
  with check (submitted_by_user_id = auth.uid());

create policy "members can read match participants"
  on public.match_participants for select to authenticated
  using (
    exists (
      select 1
      from public.match_revisions mr
      join public.matches m on m.id = mr.match_id
      join public.group_memberships gm on gm.group_id = m.group_id
      where mr.id = revision_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "members can read match games"
  on public.match_games for select to authenticated
  using (
    exists (
      select 1
      from public.match_revisions mr
      join public.matches m on m.id = mr.match_id
      join public.group_memberships gm on gm.group_id = m.group_id
      where mr.id = revision_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "participants can insert confirmations"
  on public.match_confirmations for insert to authenticated
  with check (user_id = auth.uid());

create policy "members can read confirmations"
  on public.match_confirmations for select to authenticated
  using (
    exists (
      select 1
      from public.match_revisions mr
      join public.matches m on m.id = mr.match_id
      join public.group_memberships gm on gm.group_id = m.group_id
      where mr.id = revision_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "members can read rating states"
  on public.group_rating_states for select to authenticated
  using (
    exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "members can read rating events"
  on public.rating_events for select to authenticated
  using (
    exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "admins can insert rebuild jobs"
  on public.rating_rebuild_jobs for insert to authenticated
  with check (
    created_by_user_id = auth.uid()
    and exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'admin')
        and gm.status = 'active'
        and gm.left_at is null
    )
  );

create policy "admins can read rebuild jobs"
  on public.rating_rebuild_jobs for select to authenticated
  using (
    exists (
      select 1 from public.group_memberships gm
      where gm.group_id = group_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'admin')
        and gm.status = 'active'
        and gm.left_at is null
    )
  );
