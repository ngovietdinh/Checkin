-- Cho phép quy trình triển khai (GitHub Actions, dùng khoá service_role) cấu hình tác vụ định kỳ
-- mà không cần mở SQL Editor.
create or replace function public.setup_cron(p_functions_url text, p_cron_secret text)
returns void language plpgsql security definer set search_path = app as $$
begin
  perform app.set_config('functions_url', p_functions_url);
  perform app.set_config('cron_secret', p_cron_secret);
end $$;
revoke execute on function public.setup_cron from public, anon, authenticated;
grant execute on function public.setup_cron to service_role;
