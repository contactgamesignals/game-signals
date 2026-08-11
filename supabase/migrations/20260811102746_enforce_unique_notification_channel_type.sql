create unique index if not exists notification_channels_workspace_type_key
on public.notification_channels (workspace_id, type);
