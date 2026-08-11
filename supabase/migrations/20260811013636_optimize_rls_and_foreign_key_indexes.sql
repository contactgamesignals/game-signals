-- Index foreign-key columns used by RLS joins and delete cascades.
create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);
create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);
create index if not exists notification_channels_workspace_id_idx on public.notification_channels(workspace_id);
create index if not exists delivered_notifications_channel_id_idx on public.delivered_notifications(notification_channel_id);
