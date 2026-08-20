alter function public.get_player_analytics_facts(uuid, uuid) set schema private;
alter function private.get_player_analytics_facts(uuid, uuid)
  rename to get_player_analytics_facts_without_consistency;

revoke all on function private.get_player_analytics_facts_without_consistency(uuid, uuid)
  from public, anon, authenticated;

create function public.get_player_analytics_facts(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_matches jsonb;
  v_match_count integer;
begin
  v_payload := private.get_player_analytics_facts_without_consistency(
    p_group_id,
    p_user_id
  );

  if v_payload is null or v_payload->>'status' <> 'ready' then
    return v_payload;
  end if;

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        fact.value || jsonb_build_object(
          'performanceSdAfter', round(exp(event.after_log_mean))
        )
        order by fact.ordinality
      ),
      '[]'::jsonb
    )
  into v_match_count, v_matches
  from jsonb_array_elements(v_payload->'matches') with ordinality as fact(value, ordinality)
  join public.matches as match
    on match.id = (fact.value->>'id')::uuid
    and match.group_id = p_group_id
  join public.consistency_events as event
    on event.group_id = match.group_id
    and event.match_id = match.id
    and event.revision_id = match.active_revision_id
    and event.user_id = p_user_id
  where event.after_log_mean between ln(0.5) and ln(9007199254740991);

  if v_match_count <> jsonb_array_length(v_payload->'matches') then
    raise exception using
      errcode = 'MRVAL',
      message = 'Invalid historical consistency coverage';
  end if;

  return jsonb_set(v_payload, '{matches}', v_matches);
end;
$$;

revoke all on function public.get_player_analytics_facts(uuid, uuid)
  from public, anon;
grant execute on function public.get_player_analytics_facts(uuid, uuid)
  to authenticated;

comment on function public.get_player_analytics_facts(uuid, uuid) is
  'Returns version-guarded player analytics facts with canonical post-match consistency when viewer and subject share the selected active group.';
