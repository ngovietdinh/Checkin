-- =============================================================================
-- TÁC VỤ ĐỊNH KỲ (pg_cron) – có sẵn trên Supabase Cloud và Supabase tự host
--  * Mỗi 5 phút: sinh nhắc nhở (vào ca, ra ca, vắng mặt, quên check-out, hạn việc)
--  * Mỗi phút: gọi Edge Function "push-dispatch" để gửi Web Push / Telegram / Email
--
-- Sau khi deploy, chạy 1 lần (thay giá trị thật):
--   select app.set_config('functions_url', 'https://<project>.supabase.co/functions/v1');
--   select app.set_config('cron_secret', '<chuỗi bí mật giống CRON_SECRET của edge function>');
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists app.config (
  key text primary key,
  value text not null
);
revoke all on app.config from public, anon, authenticated;

create or replace function app.set_config(p_key text, p_value text) returns void
language sql security definer set search_path = app as $$
  insert into app.config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value
$$;
revoke execute on function app.set_config from public, anon, authenticated;

create or replace function app.get_config(p_key text) returns text
language sql stable security definer set search_path = app as $$
  select value from app.config where key = p_key
$$;
revoke execute on function app.get_config from public, anon, authenticated;

create or replace function app.dispatch_push() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text := app.get_config('functions_url');
  v_secret text := app.get_config('cron_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from notifications where push_sent_at is null and created_at > now() - interval '1 hour') then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end $$;
revoke execute on function app.dispatch_push from public, anon, authenticated;
revoke execute on function app.generate_reminders from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('chamcong-reminders', 'chamcong-push');
  perform cron.schedule('chamcong-reminders', '*/5 * * * *', 'select app.generate_reminders()');
  perform cron.schedule('chamcong-push', '* * * * *', 'select app.dispatch_push()');
end $$;
