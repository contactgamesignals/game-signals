# GameSignal product and data pipeline

## Product flow

1. Visitor opens the public landing page.
2. Visitor creates an account and workspace.
3. Visitor adds a game title, aliases, exclusions, and an official URL.
4. The API validates the plan limit and writes the game to PostgreSQL.
5. Platform workers resolve platform-specific identifiers.
6. Cron selects only games whose `next_scan_at` value is due.
7. Workers fetch platform results in batches where the platform allows it.
8. Results are normalized into `mentions`.
9. The unique platform/external ID constraint removes duplicates.
10. A signal score is calculated from reach and whether the content is live.
11. Notification workers apply channel thresholds and delivery history.
12. Supabase Realtime can push inserts directly into the open dashboard.

## Twitch pipeline

- Resolve the Twitch category with Search Categories.
- Store `twitch_game_id` on the game.
- Batch up to 100 category IDs into Get Streams calls.
- Upsert live streams by Twitch stream ID.
- Refresh viewer count and `last_seen_at` on subsequent scans.
- Later improvement: keep a separate active-stream state table to detect stream endings cleanly.

## YouTube pipeline

- Build a query from include aliases and exclude phrases.
- Search only videos published after the previous scan, with a small overlap window.
- Request video statistics in a second batched call.
- Upsert videos by YouTube video ID.
- Queue due games conservatively because `search.list` has a separate daily allowance.
- Later improvement: prioritize launch windows, games with recent signal growth, and higher paid plans.

## Notification pipeline

- A new or high-value mention is matched against enabled channels.
- Viewer and signal-score thresholds are checked.
- `delivered_notifications` prevents repeated sends.
- Failed sends remain visible for retry and diagnostics.
- Discord webhook destinations must remain server-only; do not expose them through browser queries.

## Recommended next implementation order

1. Deploy and verify Supabase Auth and database migrations.
2. Verify one real Twitch title end to end.
3. Verify one real YouTube title and inspect quota usage.
4. Add Realtime inserts to the dashboard.
5. Add secure Discord webhook create/update/delete server routes.
6. Add Stripe Checkout, Stripe webhooks, and Billing portal.
7. Add email delivery and notification preferences.
8. Add Kick only through its official API.
9. Add team invitations, reports, CSV export, and audit logs.

## Additional product ideas

- Launch mode: temporarily allocate more scan budget around a release or major update.
- Creator watchlists: highlight first-time creators, returning creators, and priority press contacts.
- False-positive review: one click to convert a bad result into an exclusion rule.
- Signal velocity: score content by growth since the previous statistics refresh, not only total reach.
- Contact workflow: save outreach status, notes, and whether a key was sent.
- Competitor comparison: optional separate workspace feature with stricter limits and clear labeling.
- Digest mode: instant alerts for high-value signals and daily summaries for the rest.
- Health dashboard: quota remaining, worker latency, failed scans, unresolved categories, and notification failures.
