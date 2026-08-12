-- Read-only production audit for the rating-rebuild input contract.
-- Run in the Supabase SQL Editor. No data or migration history is changed.
with target as (
  select to_regprocedure('public.begin_rating_rebuild(uuid,uuid)')::oid as oid
), definition as (
  select pg_get_functiondef(oid) as body
  from target
  where oid is not null
), contract as (
  select body ~ $pattern$'winnerTeam'[[:space:]]*,[[:space:]]*winner_team([^[:alnum:]_]|$)$pattern$ as compatible
  from definition
)
select
  target.oid is not null as function_exists,
  coalesce(position('''winnerTeam''' in definition.body) > 0, false) as returns_winner_team_key,
  coalesce(position('winner_team' in definition.body) > 0, false) as reads_winner_team_column,
  coalesce(contract.compatible, false) as contract_compatible
from target
left join definition on true
left join contract on true;
