insert into public.internal_settings (key, value)
values
  ('public_support_phone', '+48 694 366 395'),
  ('public_signup_enabled', 'true')
on conflict (key) do update set value = excluded.value;
