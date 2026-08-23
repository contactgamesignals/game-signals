begin;

create or replace function public.claim_youtube_detail_candidates(
  p_limit integer default 500,
  p_lease_seconds integer default 120
)
returns table(
  game_id uuid,
  external_id text,
  raw_payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select c.game_id, c.external_id
    from public.youtube_detail_candidates c
    join public.games g on g.id = c.game_id
    join public.subscriptions s on s.workspace_id = g.workspace_id
    where g.enabled
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
      and c.available_at <= now()
      and (
        c.claimed_at is null
        or c.claimed_at < now() - make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 600)))
      )
      and c.attempts < 10
    order by c.first_seen_at, c.game_id, c.external_id
    for update of c skip locked
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
  )
  update public.youtube_detail_candidates c
  set claimed_at = now()
  from candidates q
  where c.game_id = q.game_id
    and c.external_id = q.external_id
  returning c.game_id, c.external_id, c.raw_payload, c.attempts;
end;
$$;

revoke all on function public.claim_youtube_detail_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_youtube_detail_candidates(integer, integer) to service_role;

-- Replace the earlier two-argument helper instead of leaving an obsolete
-- overload callable after rollout.
drop function if exists public.release_youtube_detail_candidates(jsonb, integer);

create or replace function public.release_youtube_detail_candidates(
  p_pairs jsonb,
  p_retry_after_seconds integer default 60,
  p_increment_attempts boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  with requested as (
    select x.game_id, x.external_id
    from jsonb_to_recordset(coalesce(p_pairs, '[]'::jsonb)) as x(game_id uuid, external_id text)
  )
  update public.youtube_detail_candidates c
  set claimed_at = null,
      available_at = now() + make_interval(secs => greatest(5, least(coalesce(p_retry_after_seconds, 60), 3600))),
      attempts = c.attempts + case when p_increment_attempts then 1 else 0 end
  from requested r
  where c.game_id = r.game_id
    and c.external_id = r.external_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.release_youtube_detail_candidates(jsonb, integer, boolean) from public, anon, authenticated;
grant execute on function public.release_youtube_detail_candidates(jsonb, integer, boolean) to service_role;

commit;
