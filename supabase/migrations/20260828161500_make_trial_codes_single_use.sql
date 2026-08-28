-- Influencer trial codes are one-person invite codes, not public campaign codes.
-- Each code remains valid indefinitely until it is redeemed or manually disabled.

-- Replace the operator helper before simplifying the table so no stale helper can
-- create multi-use or expiring codes.
drop function if exists private.create_trial_code(text, text, integer, timestamptz, integer);

alter table private.trial_codes
  add column if not exists assigned_to text,
  add column if not exists used_at timestamptz;

alter table private.trial_codes
  drop constraint if exists trial_codes_check,
  drop constraint if exists trial_codes_duration_days_check,
  drop constraint if exists trial_codes_max_redemptions_check,
  drop constraint if exists trial_codes_redemption_count_check;

-- No trial codes were issued before this change, but normalize defensively in case
-- this migration is replayed against an environment where rows exist.
update private.trial_codes
set duration_days = 7,
    max_redemptions = 1,
    redemption_count = case when redemption_count > 0 then 1 else 0 end,
    expires_at = null;

alter table private.trial_codes
  drop column if exists duration_days,
  drop column if exists max_redemptions,
  drop column if exists redemption_count,
  drop column if exists starts_at,
  drop column if exists expires_at;

alter table private.trial_codes
  add constraint trial_codes_assigned_to_check
  check (assigned_to is null or char_length(trim(assigned_to)) between 1 and 120);

create unique index if not exists trial_redemptions_trial_code_id_unique
  on private.trial_redemptions (trial_code_id);

comment on table private.trial_codes is
  'Operator-managed single-use influencer invite codes. A code has no automatic expiry and becomes permanently used after one redemption.';
comment on table private.trial_redemptions is
  'Immutable one-trial-per-code/workspace/user redemption records. Each redemption grants exactly 7 days of Indie-equivalent access and never auto-renews.';
comment on column private.trial_codes.assigned_to is
  'Optional operator note identifying the influencer the unused code was given to.';
comment on column private.trial_codes.used_at is
  'Set once when the one-time code is redeemed. Null means the code has never been redeemed.';

create or replace function public.redeem_trial_code(p_workspace_id uuid, p_code text)
returns table(
  trial_ends_at timestamptz,
  effective_plan public.subscription_plan,
  allowed_games integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized_code text := upper(trim(coalesce(p_code, '')));
  v_code_id uuid;
  v_code_active boolean;
  v_code_used_at timestamptz;
  v_ends_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'TRIAL_UNAUTHORIZED' using errcode = '42501';
  end if;

  if v_normalized_code !~ '^[A-Z0-9][A-Z0-9-]{3,31}$' then
    raise exception 'TRIAL_CODE_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text in ('owner', 'admin')
  ) then
    raise exception 'TRIAL_FORBIDDEN' using errcode = '42501';
  end if;

  perform 1
  from public.workspaces
  where id = p_workspace_id
  for update;

  if exists (
    select 1
    from public.subscriptions s
    where s.workspace_id = p_workspace_id
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
  ) then
    raise exception 'TRIAL_PAID_PLAN_ACTIVE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from private.trial_redemptions r
    where r.workspace_id = p_workspace_id
       or r.redeemed_by_user_id = v_user_id
  ) then
    raise exception 'TRIAL_ALREADY_USED' using errcode = 'P0001';
  end if;

  select c.id, c.active, c.used_at
  into v_code_id, v_code_active, v_code_used_at
  from private.trial_codes c
  where upper(c.code) = v_normalized_code
  for update;

  if not found then
    raise exception 'TRIAL_CODE_INVALID' using errcode = 'P0001';
  end if;

  if v_code_used_at is not null then
    raise exception 'TRIAL_CODE_USED' using errcode = 'P0001';
  end if;

  if not v_code_active then
    raise exception 'TRIAL_CODE_DISABLED' using errcode = 'P0001';
  end if;

  v_ends_at := now() + interval '7 days';

  insert into private.trial_redemptions(
    trial_code_id,
    workspace_id,
    redeemed_by_user_id,
    ends_at
  ) values (
    v_code_id,
    p_workspace_id,
    v_user_id,
    v_ends_at
  );

  update private.trial_codes
  set used_at = now(),
      active = false
  where id = v_code_id;

  perform private.reconcile_workspace_games_to_effective_limit(p_workspace_id);

  return query
  select
    v_ends_at,
    'indie'::public.subscription_plan,
    1;
end;
$$;

revoke all on function public.redeem_trial_code(uuid, text) from public, anon, service_role;
grant execute on function public.redeem_trial_code(uuid, text) to authenticated;

create or replace function private.create_trial_code(
  p_label text default 'Influencer invite',
  p_code text default null,
  p_assigned_to text default null
)
returns table(
  id uuid,
  code text,
  label text,
  assigned_to text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_label text := trim(coalesce(p_label, ''));
  v_assigned_to text := nullif(trim(coalesce(p_assigned_to, '')), '');
begin
  if v_label = '' or char_length(v_label) > 120 then
    raise exception 'TRIAL_LABEL_INVALID' using errcode = '22023';
  end if;
  if v_assigned_to is not null and char_length(v_assigned_to) > 120 then
    raise exception 'TRIAL_ASSIGNEE_INVALID' using errcode = '22023';
  end if;

  if v_code = '' then
    v_code := 'WPMG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  end if;

  if v_code !~ '^[A-Z0-9][A-Z0-9-]{3,31}$' then
    raise exception 'TRIAL_CODE_FORMAT_INVALID' using errcode = '22023';
  end if;

  return query
  insert into private.trial_codes(code, label, assigned_to, active)
  values (v_code, v_label, v_assigned_to, true)
  returning trial_codes.id, trial_codes.code, trial_codes.label, trial_codes.assigned_to;
end;
$$;

revoke all on function private.create_trial_code(text, text, text) from public, anon, authenticated, service_role;

create or replace function private.create_trial_code_batch(
  p_count integer default 100,
  p_label_prefix text default 'Influencer invite'
)
returns table(
  sequence_no integer,
  code text,
  label text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence integer;
  v_code text;
  v_label_prefix text := trim(coalesce(p_label_prefix, ''));
begin
  if p_count not between 1 and 1000 then
    raise exception 'TRIAL_BATCH_COUNT_INVALID' using errcode = '22023';
  end if;
  if v_label_prefix = '' or char_length(v_label_prefix) > 100 then
    raise exception 'TRIAL_BATCH_LABEL_INVALID' using errcode = '22023';
  end if;

  for v_sequence in 1..p_count loop
    loop
      v_code := 'WPMG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      begin
        insert into private.trial_codes(code, label, active)
        values (v_code, v_label_prefix || ' ' || lpad(v_sequence::text, 3, '0'), true);
        exit;
      exception when unique_violation then
        -- Extremely unlikely random collision: generate another code without
        -- failing the rest of the batch.
      end;
    end loop;

    sequence_no := v_sequence;
    code := v_code;
    label := v_label_prefix || ' ' || lpad(v_sequence::text, 3, '0');
    return next;
  end loop;
end;
$$;

revoke all on function private.create_trial_code_batch(integer, text) from public, anon, authenticated, service_role;
