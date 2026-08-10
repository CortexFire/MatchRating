-- Read-only pre-deployment audit. Review results manually; this script never deletes data.
select
  m.id as match_id,
  m.group_id,
  m.status,
  m.active_revision_id,
  case
    when m.active_revision_id is null then 'missing_active_revision'
    when mr.id is null then 'active_revision_not_found'
    when mr.match_id <> m.id then 'active_revision_belongs_to_another_match'
    when coalesce(participants.count, 0) not in (2, 4) then 'invalid_participant_count'
    when coalesce(games.count, 0) = 0 then 'missing_games'
  end as integrity_issue
from public.matches m
left join public.match_revisions mr on mr.id = m.active_revision_id
left join lateral (
  select count(*)::integer as count
  from public.match_participants mp
  where mp.revision_id = mr.id
) participants on true
left join lateral (
  select count(*)::integer as count
  from public.match_games mg
  where mg.revision_id = mr.id
) games on true
where
  m.active_revision_id is null
  or mr.id is null
  or mr.match_id <> m.id
  or coalesce(participants.count, 0) not in (2, 4)
  or coalesce(games.count, 0) = 0
order by m.submitted_at, m.id;

select
  g.id as group_id,
  g.rating_input_version,
  g.rating_applied_version,
  job.id as latest_job_id,
  job.status as latest_job_status,
  job.updated_at as latest_job_updated_at
from public.groups g
left join lateral (
  select rj.id, rj.status, rj.updated_at
  from public.rating_rebuild_jobs rj
  where rj.group_id = g.id
  order by rj.created_at desc, rj.id desc
  limit 1
) job on true
where g.rating_applied_version < g.rating_input_version
order by g.id;
