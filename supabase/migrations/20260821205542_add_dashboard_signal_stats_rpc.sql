create or replace function public.dashboard_signal_stats(p_workspace_id uuid)
returns table (
  signal_count bigint,
  live_now_count bigint,
  creator_count bigint,
  total_reach numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    count(*)::bigint as signal_count,
    count(*) filter (
      where m.platform = 'twitch'
        and m.last_seen_at >= now() - interval '6 minutes'
    )::bigint as live_now_count,
    count(distinct lower(m.creator_name))::bigint as creator_count,
    coalesce(sum(coalesce(m.view_count, m.viewer_count, 0)), 0)::numeric as total_reach
  from public.mentions m
  join public.games g on g.id = m.game_id
  where g.workspace_id = p_workspace_id;
$function$;

revoke all on function public.dashboard_signal_stats(uuid) from public;
revoke all on function public.dashboard_signal_stats(uuid) from anon;
grant execute on function public.dashboard_signal_stats(uuid) to authenticated;
