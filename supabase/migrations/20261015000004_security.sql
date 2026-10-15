-- =============================================================================
-- BẢO MẬT: Row Level Security, quyền gọi hàm, kho lưu trữ (selfie, đính kèm)
-- =============================================================================

-- Hàm nội bộ: chỉ cho role đăng nhập gọi
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
revoke all on all tables in schema app from public, anon, authenticated;

-- RPC public: không cho khách (anon) gọi
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Bảng: khách không truy cập gì
revoke all on all tables in schema public from anon;

-- Danh bạ nội bộ: ai cũng xem được thông tin cơ bản của đồng nghiệp
create view public.employee_directory as
  select id, code, full_name, avatar_url, role, department_id, position_id, manager_id, active
  from public.employees;
revoke all on public.employee_directory from anon;
grant select on public.employee_directory to authenticated;

-- Bật RLS cho tất cả bảng public
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Danh mục dùng chung: mọi người xem, HR sửa
-- ---------------------------------------------------------------------------
create policy read_all on public.settings for select to authenticated using (true);
create policy hr_write on public.settings for update to authenticated using (app.is_hr()) with check (app.is_hr());

do $$
declare t text;
begin
  foreach t in array array['branches', 'departments', 'positions', 'shifts', 'holidays', 'employee_branches', 'payroll_periods'] loop
    execute format('create policy read_all on public.%I for select to authenticated using (true)', t);
    execute format('create policy hr_write on public.%I for all to authenticated using (app.is_hr()) with check (app.is_hr())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Nhân viên
-- ---------------------------------------------------------------------------
create policy read_visible on public.employees for select to authenticated
  using (id = any((select app.visible_employee_ids())::uuid[]));
create policy hr_write on public.employees for all to authenticated
  using (app.is_hr()) with check (app.is_hr());

-- Nhân viên tự cập nhật một số thông tin cá nhân
create or replace function public.update_my_profile(p_phone text default null, p_avatar_url text default null, p_telegram_chat_id text default null)
returns public.employees language sql security definer set search_path = public as $$
  update employees set
    phone = coalesce(p_phone, phone),
    avatar_url = coalesce(p_avatar_url, avatar_url),
    telegram_chat_id = coalesce(nullif(p_telegram_chat_id, ''), telegram_chat_id)
  where id = auth.uid()
  returning *
$$;
grant execute on function public.update_my_profile to authenticated;

-- Lương: chỉ HR và chính nhân viên
create policy read_own_or_hr on public.employee_compensation for select to authenticated
  using (employee_id = auth.uid() or app.is_hr());
create policy hr_write on public.employee_compensation for all to authenticated
  using (app.is_hr()) with check (app.is_hr());

create policy read_own_or_hr on public.employee_allowances for select to authenticated
  using (employee_id = auth.uid() or app.is_hr());
create policy hr_write on public.employee_allowances for all to authenticated
  using (app.is_hr()) with check (app.is_hr());

create policy read_visible on public.leave_carryovers for select to authenticated
  using (employee_id = any((select app.visible_employee_ids())::uuid[]));
create policy hr_write on public.leave_carryovers for all to authenticated
  using (app.is_hr()) with check (app.is_hr());

-- ---------------------------------------------------------------------------
-- Lịch: HR & quản lý/trưởng nhóm xếp lịch cho người mình quản lý
-- ---------------------------------------------------------------------------
create policy read_visible on public.schedules for select to authenticated
  using (employee_id = any((select app.visible_employee_ids())::uuid[]));
create policy manager_write on public.schedules for all to authenticated
  using (app.is_hr() or (app.is_manager_role() and employee_id <> auth.uid()
         and employee_id = any((select app.visible_employee_ids())::uuid[])))
  with check (app.is_hr() or (app.is_manager_role() and employee_id <> auth.uid()
         and employee_id = any((select app.visible_employee_ids())::uuid[])));

-- ---------------------------------------------------------------------------
-- Chấm công: ghi qua RPC check_in/check_out; HR sửa tay
-- ---------------------------------------------------------------------------
create policy read_visible on public.attendance for select to authenticated
  using (employee_id = any((select app.visible_employee_ids())::uuid[]));
create policy hr_write on public.attendance for all to authenticated
  using (app.is_hr()) with check (app.is_hr());

-- Quản lý xác nhận đã kiểm tra lượt chấm nghi vấn
create or replace function public.review_attendance(p_id uuid, p_note text default null, p_clear_flags boolean default false)
returns public.attendance language plpgsql security definer set search_path = public as $$
declare v_rec attendance;
begin
  select * into v_rec from attendance where id = p_id;
  if not found then perform app.raise_err('NOT_FOUND'); end if;
  if v_rec.employee_id = auth.uid() or not app.can_see(v_rec.employee_id) then perform app.raise_err('FORBIDDEN'); end if;
  update attendance set reviewed_by = auth.uid(), reviewed_at = now(),
    note = case when p_note is null then note else coalesce(note || E'\n', '') || p_note end,
    flags = case when p_clear_flags then '{}' else flags end
  where id = p_id returning * into v_rec;
  return v_rec;
end $$;
grant execute on function public.review_attendance to authenticated;

-- ---------------------------------------------------------------------------
-- Đơn từ: ghi qua RPC; xem của mình, người mình quản lý, hoặc đơn mình cần duyệt
-- ---------------------------------------------------------------------------
create policy read_related on public.requests for select to authenticated
  using (employee_id = any((select app.visible_employee_ids())::uuid[])
         or steps @> jsonb_build_array(jsonb_build_object('approver_id', auth.uid())));

-- ---------------------------------------------------------------------------
-- Công việc
-- ---------------------------------------------------------------------------
create policy read_related on public.tasks for select to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid()
         or assignee_id = any((select app.visible_employee_ids())::uuid[]));
create policy create_task on public.tasks for insert to authenticated
  with check (created_by = auth.uid() and
              (assignee_id = auth.uid() or app.is_hr()
               or (app.is_manager_role() and assignee_id = any((select app.visible_employee_ids())::uuid[]))));
create policy update_task on public.tasks for update to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid() or app.is_hr())
  with check (assignee_id = auth.uid() or created_by = auth.uid() or app.is_hr()
              or assignee_id = any((select app.visible_employee_ids())::uuid[]));
create policy delete_task on public.tasks for delete to authenticated
  using (created_by = auth.uid() or app.is_hr());

create policy read_task_comments on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy write_task_comments on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
create policy delete_own_comment on public.task_comments for delete to authenticated
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Báo cáo ngày
-- ---------------------------------------------------------------------------
create policy read_visible on public.daily_reports for select to authenticated
  using (employee_id = any((select app.visible_employee_ids())::uuid[]));
create policy write_own on public.daily_reports for insert to authenticated
  with check (employee_id = auth.uid() and report_date between app.today() - 3 and app.today());
create policy update_own on public.daily_reports for update to authenticated
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Lương
-- ---------------------------------------------------------------------------
create policy read_own_or_hr on public.payroll_adjustments for select to authenticated
  using (employee_id = auth.uid() or app.is_hr());
create policy hr_write on public.payroll_adjustments for all to authenticated
  using (app.is_hr()) with check (app.is_hr());

create policy read_own_published on public.payslips for select to authenticated
  using (app.is_hr() or (employee_id = auth.uid()
         and exists (select 1 from public.payroll_periods p where p.month = payslips.month and p.status = 'published')));
create policy hr_write on public.payslips for all to authenticated
  using (app.is_hr()) with check (app.is_hr());

-- ---------------------------------------------------------------------------
-- Thông báo
-- ---------------------------------------------------------------------------
create policy read_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy read_targeted on public.announcements for select to authenticated
  using (target = 'all' or app.is_hr() or created_by = auth.uid()
         or (target = 'department' and exists (select 1 from public.employees e where e.id = auth.uid() and e.department_id = any(target_ids)))
         or (target = 'branch' and exists (select 1 from public.employee_branches eb where eb.employee_id = auth.uid() and eb.branch_id = any(target_ids))));
create policy manager_create on public.announcements for insert to authenticated
  with check (created_by = auth.uid() and coalesce(app.my_role() in ('admin', 'hr', 'manager'), false));
create policy owner_delete on public.announcements for delete to authenticated
  using (created_by = auth.uid() or app.is_hr());
create policy owner_update on public.announcements for update to authenticated
  using (created_by = auth.uid() or app.is_hr()) with check (created_by = auth.uid() or app.is_hr());

create policy own_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy hr_read on public.audit_logs for select to authenticated using (app.is_hr());

-- ---------------------------------------------------------------------------
-- Realtime: thông báo & chấm công cập nhật trực tiếp
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.attendance;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Kho lưu trữ
--   selfies/{user_id}/...      : riêng tư; chủ sở hữu + người quản lý xem
--   attachments/{user_id}/...  : riêng tư; mọi nhân viên đăng nhập xem (đính kèm đơn/việc/báo cáo)
--   avatars/{user_id}/...      : công khai
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('selfies', 'selfies', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('attachments', 'attachments', false, 10485760, null),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "selfie upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "selfie read visible" on storage.objects for select to authenticated
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = any((select app.visible_employee_ids())::text[]));

create policy "attachment upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachment read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
create policy "attachment delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or app.is_hr()));
create policy "avatar update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or app.is_hr()));
create policy "avatar read" on storage.objects for select using (bucket_id = 'avatars');
