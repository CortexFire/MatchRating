update public.group_invites
set expires_at = null,
    max_uses = null
where revoked_at is null;

with ranked_invites as (
  select
    id,
    row_number() over (partition by group_id order by created_at desc, id desc) as active_rank
  from public.group_invites
  where revoked_at is null
)
update public.group_invites invite
set revoked_at = now()
from ranked_invites ranked
where invite.id = ranked.id
  and ranked.active_rank > 1;

create unique index if not exists group_invites_one_active_per_group_idx
  on public.group_invites (group_id)
  where revoked_at is null;
