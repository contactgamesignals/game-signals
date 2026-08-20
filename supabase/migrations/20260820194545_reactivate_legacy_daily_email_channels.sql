-- Reactivate legacy email channels that were disabled during the temporary
-- pre-launch email hold. Current user opt-out deletes the channel instead of
-- leaving a disabled row, so these existing configured rows represent prior
-- email opt-in.
update public.notification_channels
set enabled = true,
    minimum_signal_score = 0,
    updated_at = now()
where type = 'email'
  and enabled = false
  and nullif(trim(destination), '') is not null;
