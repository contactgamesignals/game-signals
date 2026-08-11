-- Run this only after deploying the Edge Functions and setting CRON_SECRET.
-- In hosted Supabase you can alternatively create these jobs in Integrations -> Cron.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET before executing.
-- select cron.schedule(
--   'gamesignal-twitch-every-3-minutes',
--   '*/3 * * * *',
--   $$select net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scan-twitch',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
--     body := '{}'::jsonb
--   );$$
-- );
--
-- select cron.schedule(
--   'gamesignal-youtube-every-15-minutes',
--   '*/15 * * * *',
--   $$select net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scan-youtube',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
--     body := '{}'::jsonb
--   );$$
-- );
--
-- select cron.schedule(
--   'gamesignal-discord-every-minute',
--   '* * * * *',
--   $$select net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-discord',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
--     body := '{}'::jsonb
--   );$$
-- );
