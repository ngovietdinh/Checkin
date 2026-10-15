-- =============================================================================
-- SIẾT BẢO MẬT
-- 1. Tài khoản đăng nhập nhưng KHÔNG có hồ sơ nhân viên đang làm việc (vd. ai đó tự đăng ký
--    khi quên tắt "Allow new users to sign up") thì không đọc được bất kỳ dữ liệu nào.
-- 2. Edge Function được gọi bởi pg_cron kiểm tra mã bí mật lưu trong database
--    (không bắt buộc phải khai báo CRON_SECRET thủ công).
-- =============================================================================

create or replace function app.is_employee() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees where id = auth.uid() and active)
$$;
grant execute on function app.is_employee() to authenticated;

-- Danh mục dùng chung: chỉ nhân viên mới xem được
do $$
declare t text;
begin
  foreach t in array array['settings', 'branches', 'departments', 'positions', 'shifts', 'holidays', 'employee_branches', 'payroll_periods'] loop
    execute format('drop policy if exists read_all on public.%I', t);
    execute format('create policy read_all on public.%I for select to authenticated using ((select app.is_employee()))', t);
  end loop;
end $$;

-- Danh bạ: chỉ nhân viên
create or replace view public.employee_directory as
  select id, code, full_name, avatar_url, role, department_id, position_id, manager_id, active
  from public.employees
  where (select app.is_employee());

-- Thông báo chung gửi toàn công ty: chỉ nhân viên
drop policy if exists read_targeted on public.announcements;
create policy read_targeted on public.announcements for select to authenticated
  using ((select app.is_employee()) and (
         target = 'all' or app.is_hr() or created_by = auth.uid()
         or (target = 'department' and exists (select 1 from public.employees e where e.id = auth.uid() and e.department_id = any(target_ids)))
         or (target = 'branch' and exists (select 1 from public.employee_branches eb where eb.employee_id = auth.uid() and eb.branch_id = any(target_ids)))));

-- Bình luận công việc phụ thuộc quyền xem công việc (đã an toàn); tệp đính kèm: chỉ nhân viên
drop policy if exists "attachment read" on storage.objects;
create policy "attachment read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (select app.is_employee()));

-- Kiểm tra mã bí mật của tác vụ định kỳ (Edge Function gọi bằng khoá service_role)
create or replace function public.verify_cron_secret(p_secret text) returns boolean
language sql stable security definer set search_path = app as $$
  select p_secret is not null and p_secret = app.get_config('cron_secret')
$$;
revoke execute on function public.verify_cron_secret from public, anon, authenticated;
grant execute on function public.verify_cron_secret to service_role;

-- Tự sinh mã bí mật nếu chưa có (functions_url cấu hình sau qua setup_cron)
insert into app.config (key, value) values ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function public.setup_cron(p_functions_url text, p_cron_secret text default null)
returns void language plpgsql security definer set search_path = app as $$
begin
  perform app.set_config('functions_url', p_functions_url);
  if p_cron_secret is not null then perform app.set_config('cron_secret', p_cron_secret); end if;
end $$;
revoke execute on function public.setup_cron(text, text) from public, anon, authenticated;
grant execute on function public.setup_cron(text, text) to service_role;
