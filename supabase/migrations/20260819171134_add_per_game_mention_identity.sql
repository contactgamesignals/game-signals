alter table public.mentions
  add constraint mentions_game_platform_external_id_key
  unique (game_id, platform, external_id);
