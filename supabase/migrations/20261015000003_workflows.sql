-- =============================================================================
-- QUY TRÌNH: đơn từ & duyệt nhiều cấp, quỹ phép, công việc, báo cáo,
-- thông báo chung, kỳ lương, nhắc nhở tự động
-- =============================================================================

create or replace function app.request_label(p_type public.request_type) returns text
language sql immutable as $$
  select case p_type
    when 'leave_annual' then 'Nghỉ phép năm'
    when 'leave_sick' then 'Nghỉ ốm'
    when 'leave_unpaid' then 'Nghỉ không lương'
    when 'leave_paid' then 'Nghỉ có lương (chế độ)'
    when 'ot' then 'Tăng ca'
    when 'late' then 'Đi muộn'
    when 'early' then 'Về sớm'
    when 'business_trip' then 'Công tác'
    when 'forgot_checkin' then 'Quên chấm công'
    when 'shift_swap' then 'Đổi ca'
    when 'device_change' then 'Đổi thiết bị'
  end
$$;

-- ---------------------------------------------------------------------------
-- Quỹ phép năm
-- ---------------------------------------------------------------------------
create or replace function public.leave_balance(p_emp uuid default null, p_year int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_emp employees;
  v_year int := coalesce(p_year, extract(year from app.today())::int);
  v_cfg jsonb := app.cfg('leave');
  v_quota numeric;
  v_bonus numeric := 0;
  v_every int := coalesce((v_cfg->>'seniority_bonus_every_years')::int, 0);
  v_months int;
  v_accrued numeric;
  v_carried numeric;
  v_used numeric;
  v_pending numeric;
  v_first_month int := 1;
begin
  select * into v_emp from employees where id = coalesce(p_emp, auth.uid());
  if not found or not app.can_see(v_emp.id) then perform app.raise_err('FORBIDDEN'); end if;

  v_quota := coalesce(v_emp.annual_leave_days, (v_cfg->>'annual_quota_default')::numeric, 12);
  -- thâm niên: cứ đủ N năm làm việc được cộng thêm 1 ngày (Điều 114 BLLĐ)
  if v_every > 0 then
    v_bonus := floor(extract(year from age(make_date(v_year, 1, 1), v_emp.join_date)) / v_every);
    if v_bonus < 0 then v_bonus := 0; end if;
  end if;
  v_quota := v_quota + v_bonus;

  if extract(year from v_emp.join_date) = v_year then v_first_month := extract(month from v_emp.join_date)::int; end if;
  if extract(year from v_emp.join_date) > v_year then v_quota := 0; end if;

  if coalesce((v_cfg->>'accrue_monthly')::boolean, true) then
    if v_year < extract(year from app.today()) then v_months := 12;
    elsif v_year > extract(year from app.today()) then v_months := 0;
    else v_months := extract(month from app.today())::int;
    end if;
    v_months := greatest(0, v_months - v_first_month + 1);
    v_accrued := floor(v_quota * v_months / 12 * 2) / 2;
  else
    v_accrued := floor(v_quota * (13 - v_first_month) / 12 * 2) / 2;
  end if;

  select coalesce(days, 0) into v_carried from leave_carryovers where employee_id = v_emp.id and year = v_year;
  v_carried := coalesce(v_carried, 0);
  select coalesce(sum(days), 0) into v_used from requests
    where employee_id = v_emp.id and type = 'leave_annual' and status = 'approved' and extract(year from start_date) = v_year;
  select coalesce(sum(days), 0) into v_pending from requests
    where employee_id = v_emp.id and type = 'leave_annual' and status = 'pending' and extract(year from start_date) = v_year;

  return jsonb_build_object(
    'year', v_year, 'quota', v_quota, 'seniority_bonus', v_bonus, 'accrued', v_accrued,
    'carried', v_carried, 'used', v_used, 'pending', v_pending,
    'remaining', v_accrued + v_carried - v_used - v_pending
  );
end $$;

-- Số ngày làm việc theo lịch trong khoảng
create or replace function app.count_work_days(p_emp uuid, p_from date, p_to date) returns numeric
language sql stable security definer set search_path = public as $$
  select count(distinct work_date)::numeric from app.resolve_schedule(array[p_emp], p_from, p_to)
$$;

-- ---------------------------------------------------------------------------
-- Đơn từ
-- ---------------------------------------------------------------------------
create or replace function app.build_steps(p_emp public.employees, p_type public.request_type, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_flow jsonb := coalesce(app.cfg('approval_flows', p_type::text), app.cfg('approval_flows', 'default'), '["direct_manager","hr"]');
  v_step text;
  v_approver uuid;
  v_steps jsonb := '[]';
  v_last text := null;
begin
  for v_step in select jsonb_array_elements_text(v_flow) loop
    v_approver := null;
    if v_step = 'direct_manager' then
      v_approver := p_emp.manager_id;
      if v_approver is null then continue; end if;
    elsif v_step = 'department_manager' then
      select manager_id into v_approver from departments where id = p_emp.department_id;
      if v_approver is null then continue; end if;
    elsif v_step = 'swap_partner' then
      v_approver := (p_payload->>'partner_id')::uuid;
      if v_approver is null then continue; end if;
    elsif v_step <> 'hr' then
      continue;
    end if;
    if v_approver = p_emp.id then continue; end if;
    -- bỏ bước trùng người duyệt liên tiếp
    if coalesce(v_approver::text, 'hr') = v_last then continue; end if;
    v_last := coalesce(v_approver::text, 'hr');
    v_steps := v_steps || jsonb_build_object('type', v_step, 'approver_id', v_approver);
  end loop;
  -- không có ai duyệt (vd. chưa có quản lý) -> HR duyệt
  if jsonb_array_length(v_steps) = 0
     or (jsonb_array_length(v_steps) = 1 and v_steps->0->>'type' = 'swap_partner') then
    v_steps := v_steps || jsonb_build_object('type', 'hr', 'approver_id', null);
  end if;
  return v_steps;
end $$;

create or replace function app.notify_step(p_req public.requests) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_step jsonb := p_req.steps -> p_req.current_step;
  v_name text := (select full_name from employees where id = p_req.employee_id);
  v_title text := 'Đơn cần duyệt: ' || app.request_label(p_req.type);
  v_body text := v_name || ' – ' || to_char(p_req.start_date, 'DD/MM/YYYY') ||
                 case when p_req.end_date <> p_req.start_date then ' → ' || to_char(p_req.end_date, 'DD/MM/YYYY') else '' end;
begin
  if v_step is null then return; end if;
  if v_step->>'approver_id' is not null then
    perform app.notify((v_step->>'approver_id')::uuid, 'request', v_title, v_body, '/approvals');
  else
    perform app.notify_hr('request', v_title, v_body, '/approvals');
  end if;
end $$;

create or replace function public.submit_request(
  p_type public.request_type,
  p_start date,
  p_end date default null,
  p_half_day text default null,
  p_start_time time default null,
  p_end_time time default null,
  p_hours numeric default null,
  p_reason text default null,
  p_attachment text default null,
  p_payload jsonb default '{}'::jsonb
) returns public.requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_emp employees;
  v_end date := coalesce(p_end, p_start);
  v_days numeric;
  v_hours numeric := p_hours;
  v_bal jsonb;
  v_rec requests;
begin
  select * into v_emp from employees where id = v_uid and active;
  if not found then perform app.raise_err('NOT_EMPLOYEE'); end if;
  if v_end < p_start then perform app.raise_err('INVALID_RANGE'); end if;
  if p_half_day is not null and v_end <> p_start then perform app.raise_err('HALF_DAY_SINGLE_DATE'); end if;

  if p_type in ('leave_annual', 'leave_sick', 'leave_unpaid', 'leave_paid', 'business_trip') then
    v_days := case when p_half_day is not null then 0.5 else app.count_work_days(v_uid, p_start, v_end) end;
    if v_days = 0 then perform app.raise_err('NO_WORK_DAYS'); end if;
    if exists (select 1 from requests where employee_id = v_uid and status in ('pending', 'approved')
               and type in ('leave_annual', 'leave_sick', 'leave_unpaid', 'leave_paid', 'business_trip')
               and daterange(start_date, end_date, '[]') && daterange(p_start, v_end, '[]')
               and not (half_day is not null and p_half_day is not null and half_day <> p_half_day)) then
      perform app.raise_err('OVERLAP');
    end if;
    if p_type = 'leave_annual' then
      v_bal := public.leave_balance(v_uid, extract(year from p_start)::int);
      if (v_bal->>'remaining')::numeric < v_days then
        perform app.raise_err('INSUFFICIENT_LEAVE', jsonb_build_object('remaining', v_bal->'remaining', 'requested', v_days));
      end if;
    end if;
  elsif p_type = 'ot' then
    if v_hours is null and p_start_time is not null and p_end_time is not null then
      v_hours := round((extract(epoch from (p_end_time - p_start_time)) / 3600)::numeric
                       + case when p_end_time <= p_start_time then 24 else 0 end, 2);
    end if;
    if coalesce(v_hours, 0) <= 0 then perform app.raise_err('HOURS_REQUIRED'); end if;
  elsif p_type = 'forgot_checkin' then
    if p_payload->>'check_in_at' is null and p_payload->>'check_out_at' is null then
      perform app.raise_err('TIME_REQUIRED');
    end if;
  elsif p_type = 'shift_swap' then
    if p_payload->>'partner_id' is null or (p_payload->>'partner_id')::uuid = v_uid then
      perform app.raise_err('PARTNER_REQUIRED');
    end if;
  elsif p_type = 'device_change' then
    if p_payload->>'device_id' is null then perform app.raise_err('DEVICE_REQUIRED'); end if;
  end if;

  insert into requests (employee_id, type, start_date, end_date, half_day, start_time, end_time,
                        hours, days, reason, attachment, payload, steps)
  values (v_uid, p_type, p_start, v_end, p_half_day, p_start_time, p_end_time,
          v_hours, v_days, p_reason, p_attachment, coalesce(p_payload, '{}'),
          app.build_steps(v_emp, p_type, p_payload))
  returning * into v_rec;

  perform app.notify_step(v_rec);
  return v_rec;
end $$;

-- Áp dụng đơn đã duyệt vào dữ liệu
create or replace function app.apply_request(p_req public.requests) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_att attendance;
  v_shift uuid;
  v_mine record;
  v_partner uuid;
begin
  if p_req.type = 'forgot_checkin' then
    select * into v_att from attendance
      where employee_id = p_req.employee_id and work_date = p_req.start_date
        and (p_req.payload->>'attendance_id' is null or id = (p_req.payload->>'attendance_id')::uuid)
      order by check_in_at limit 1;
    if v_att.id is not null then
      update attendance set
        check_in_at = coalesce((p_req.payload->>'check_in_at')::timestamptz, check_in_at),
        check_out_at = coalesce((p_req.payload->>'check_out_at')::timestamptz, check_out_at),
        missing_checkout = false, source = 'request',
        note = coalesce(note || E'\n', '') || 'Theo đơn quên chấm công'
      where id = v_att.id;
    else
      select shift_id into v_shift from app.resolve_schedule(array[p_req.employee_id], p_req.start_date, p_req.start_date)
        order by shift_id limit 1;
      insert into attendance (employee_id, work_date, shift_id, check_in_at, check_out_at, source, note)
      values (p_req.employee_id, p_req.start_date, coalesce((p_req.payload->>'shift_id')::uuid, v_shift),
              (p_req.payload->>'check_in_at')::timestamptz, (p_req.payload->>'check_out_at')::timestamptz,
              'request', 'Theo đơn quên chấm công');
    end if;

  elsif p_req.type = 'late' then
    update attendance set excused_late = true
      where employee_id = p_req.employee_id and work_date between p_req.start_date and p_req.end_date;

  elsif p_req.type = 'early' then
    update attendance set excused_early = true
      where employee_id = p_req.employee_id and work_date between p_req.start_date and p_req.end_date;

  elsif p_req.type = 'device_change' then
    update employees set device_id = p_req.payload->>'device_id',
                         device_label = p_req.payload->>'device_label',
                         device_bound_at = now()
      where id = p_req.employee_id;

  elsif p_req.type = 'shift_swap' then
    v_partner := (p_req.payload->>'partner_id')::uuid;
    -- chụp lịch hiện tại của cả hai rồi hoán đổi bằng lịch cụ thể
    create temp table if not exists _swap (emp uuid, shift_id uuid, branch_id uuid) on commit drop;
    delete from _swap;
    insert into _swap select employee_id, shift_id, branch_id
      from app.resolve_schedule(array[p_req.employee_id, v_partner], p_req.start_date, p_req.start_date);
    delete from schedules where work_date = p_req.start_date and employee_id in (p_req.employee_id, v_partner);
    for v_mine in select * from (values (p_req.employee_id, v_partner), (v_partner, p_req.employee_id)) as t(target, source) loop
      if exists (select 1 from _swap where emp = v_mine.source) then
        insert into schedules (employee_id, work_date, shift_id, branch_id, note)
          select v_mine.target, p_req.start_date, shift_id, branch_id, 'Đổi ca' from _swap where emp = v_mine.source;
      else
        insert into schedules (employee_id, work_date, is_off, note) values (v_mine.target, p_req.start_date, true, 'Đổi ca');
      end if;
    end loop;
  end if;
end $$;

create or replace function public.decide_request(p_id uuid, p_approve boolean, p_comment text default null)
returns public.requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req requests;
  v_step jsonb;
  v_allowed boolean;
begin
  select * into v_req from requests where id = p_id for update;
  if not found then perform app.raise_err('NOT_FOUND'); end if;
  if v_req.status <> 'pending' then perform app.raise_err('ALREADY_DECIDED'); end if;
  if v_req.employee_id = v_uid and not app.is_admin() then perform app.raise_err('FORBIDDEN'); end if;

  v_step := v_req.steps -> v_req.current_step;
  v_allowed := app.is_admin()
    or (v_step->>'approver_id')::uuid = v_uid
    or (v_step->>'approver_id' is null and app.is_hr());
  if not v_allowed then perform app.raise_err('FORBIDDEN'); end if;

  v_req.steps := jsonb_set(v_req.steps, array[v_req.current_step::text],
    v_step || jsonb_build_object('action', case when p_approve then 'approved' else 'rejected' end,
                                 'by', v_uid, 'at', now(), 'comment', p_comment));

  if not p_approve then
    update requests set status = 'rejected', steps = v_req.steps where id = p_id returning * into v_req;
    perform app.notify(v_req.employee_id, 'request_result', 'Đơn bị từ chối: ' || app.request_label(v_req.type),
                       coalesce(p_comment, ''), '/requests');
  elsif v_req.current_step + 1 < jsonb_array_length(v_req.steps) then
    update requests set current_step = current_step + 1, steps = v_req.steps where id = p_id returning * into v_req;
    perform app.notify_step(v_req);
  else
    update requests set status = 'approved', steps = v_req.steps where id = p_id returning * into v_req;
    perform app.apply_request(v_req);
    perform app.notify(v_req.employee_id, 'request_result', 'Đơn đã được duyệt: ' || app.request_label(v_req.type),
                       coalesce(p_comment, ''), '/requests');
  end if;
  return v_req;
end $$;

create or replace function public.cancel_request(p_id uuid) returns public.requests
language plpgsql security definer set search_path = public as $$
declare
  v_req requests;
begin
  select * into v_req from requests where id = p_id for update;
  if not found then perform app.raise_err('NOT_FOUND'); end if;
  if v_req.employee_id = auth.uid() and v_req.status = 'pending' then null;
  elsif app.is_hr() and v_req.status in ('pending', 'approved') then null;
  else perform app.raise_err('FORBIDDEN');
  end if;
  update requests set status = 'cancelled' where id = p_id returning * into v_req;
  return v_req;
end $$;

-- ---------------------------------------------------------------------------
-- Báo cáo công việc: quản lý nhận xét
-- ---------------------------------------------------------------------------
create or replace function public.review_report(p_id uuid, p_score smallint, p_comment text default null)
returns public.daily_reports
language plpgsql security definer set search_path = public as $$
declare
  v_rep daily_reports;
begin
  select * into v_rep from daily_reports where id = p_id;
  if not found then perform app.raise_err('NOT_FOUND'); end if;
  if v_rep.employee_id = auth.uid() or not app.can_see(v_rep.employee_id) then perform app.raise_err('FORBIDDEN'); end if;
  update daily_reports set score = p_score, manager_comment = p_comment, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_id returning * into v_rep;
  perform app.notify(v_rep.employee_id, 'report', 'Báo cáo ngày ' || to_char(v_rep.report_date, 'DD/MM') || ' đã được nhận xét',
                     coalesce(p_score::text || '★ ', '') || coalesce(p_comment, ''), '/reports');
  return v_rep;
end $$;

-- Nhân viên chỉ sửa được báo cáo chưa được nhận xét, và không tự chấm điểm
create or replace function app.guard_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.employee_id = auth.uid() then
    if tg_op = 'UPDATE' and old.reviewed_at is not null then perform app.raise_err('REPORT_REVIEWED'); end if;
    if tg_op = 'INSERT' then
      new.score := null; new.manager_comment := null; new.reviewed_by := null; new.reviewed_at := null;
    else
      new.score := old.score; new.manager_comment := old.manager_comment;
      new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end $$;
create trigger daily_reports_guard before insert or update on public.daily_reports
  for each row execute function app.guard_report();

-- ---------------------------------------------------------------------------
-- Công việc
-- ---------------------------------------------------------------------------
create or replace function app.task_guard_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.assignee_id <> coalesce(new.created_by, v_uid) then
      perform app.notify(new.assignee_id, 'task', 'Việc mới: ' || new.title,
        case when new.due_at is not null then 'Hạn: ' || to_char(new.due_at at time zone app.tz(), 'HH24:MI DD/MM/YYYY') end,
        '/tasks/' || new.id);
    end if;
    return new;
  end if;

  -- người được giao (không phải người tạo/HR) chỉ được đổi trạng thái & tiến độ
  if v_uid = old.assignee_id and v_uid <> old.created_by and not app.is_hr() then
    if new.title is distinct from old.title or new.description is distinct from old.description
       or new.assignee_id is distinct from old.assignee_id or new.due_at is distinct from old.due_at
       or new.priority is distinct from old.priority or new.created_by is distinct from old.created_by then
      perform app.raise_err('FORBIDDEN');
    end if;
  end if;

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
    new.progress := 100;
    if new.created_by <> v_uid then
      perform app.notify(new.created_by, 'task', 'Đã hoàn thành: ' || new.title, null, '/tasks/' || new.id);
    end if;
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if new.assignee_id <> old.assignee_id then
    perform app.notify(new.assignee_id, 'task', 'Việc mới: ' || new.title, null, '/tasks/' || new.id);
  end if;
  return new;
end $$;
create trigger tasks_guard_notify before insert or update on public.tasks
  for each row execute function app.task_guard_notify();

create or replace function app.task_comment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks;
  v_name text;
begin
  select * into v_task from tasks where id = new.task_id;
  select full_name into v_name from employees where id = new.author_id;
  if new.author_id <> v_task.assignee_id then
    perform app.notify(v_task.assignee_id, 'task', v_name || ' bình luận: ' || v_task.title, left(new.body, 140), '/tasks/' || v_task.id);
  end if;
  if new.author_id <> v_task.created_by and v_task.created_by <> v_task.assignee_id then
    perform app.notify(v_task.created_by, 'task', v_name || ' bình luận: ' || v_task.title, left(new.body, 140), '/tasks/' || v_task.id);
  end if;
  return new;
end $$;
create trigger task_comments_notify after insert on public.task_comments
  for each row execute function app.task_comment_notify();

-- ---------------------------------------------------------------------------
-- Thông báo chung: gửi tới đúng đối tượng
-- ---------------------------------------------------------------------------
create or replace function app.announcement_fanout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  select e.id, 'announcement', new.title, left(new.body, 200), '/announcements'
  from employees e
  where e.active and e.id <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
    and (new.target = 'all'
      or (new.target = 'department' and e.department_id = any(new.target_ids))
      or (new.target = 'branch' and exists (select 1 from employee_branches eb
                                            where eb.employee_id = e.id and eb.branch_id = any(new.target_ids))));
  return new;
end $$;
create trigger announcements_fanout after insert on public.announcements
  for each row execute function app.announcement_fanout();

-- ---------------------------------------------------------------------------
-- Kỳ lương: chốt / mở / công bố
-- ---------------------------------------------------------------------------
create or replace function public.set_payroll_status(p_month text, p_status public.payroll_status)
returns public.payroll_periods
language plpgsql security definer set search_path = public as $$
declare
  v_period payroll_periods;
begin
  if not app.is_hr() then perform app.raise_err('FORBIDDEN'); end if;
  select * into v_period from payroll_periods where month = p_month for update;
  if not found then perform app.raise_err('NOT_FOUND'); end if;
  if p_status = 'draft' and not app.is_admin() then perform app.raise_err('ADMIN_ONLY'); end if;

  update payroll_periods set
    status = p_status,
    locked_at = case when p_status in ('locked', 'published') then coalesce(locked_at, now()) else null end,
    published_at = case when p_status = 'published' then now() else null end
  where month = p_month returning * into v_period;

  if p_status = 'published' then
    insert into notifications (user_id, type, title, body, link)
    select employee_id, 'payslip', 'Đã có phiếu lương tháng ' || to_char(to_date(p_month, 'YYYY-MM'), 'MM/YYYY'),
           'Thực lĩnh: ' || to_char(net, 'FM999G999G999G999') || ' đ', '/payslips'
    from payslips where month = p_month;
  end if;
  return v_period;
end $$;

-- ---------------------------------------------------------------------------
-- Nhắc nhở tự động (pg_cron chạy mỗi 5 phút)
-- ---------------------------------------------------------------------------
create or replace function app.remind_once(p_key text) returns boolean
language plpgsql security definer set search_path = public, app as $$
begin
  insert into app.reminder_log (key) values (p_key);
  return true;
exception when unique_violation then
  return false;
end $$;

create or replace function app.generate_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := app.today();
  v_r jsonb := coalesce(app.cfg('reminders'), '{}');
  v_before int := coalesce((v_r->>'checkin_before_min')::int, 15);
  v_after int := coalesce((v_r->>'checkout_after_min')::int, 5);
  v_absent int := coalesce((v_r->>'absent_after_min')::int, 30);
  v_due int := coalesce((v_r->>'task_due_hours')::int, 24);
  v_missing int := coalesce((app.cfg('attendance', 'missing_checkout_after_hours'))::text::int, 4);
  v_count int := 0;
  rec record;
begin
  for rec in
    select r.employee_id, r.work_date, s.id as shift_id, s.name,
           app.shift_start(r.work_date, s) as st, app.shift_end(r.work_date, s) as en,
           e.full_name, e.manager_id
    from app.resolve_schedule(null, v_today - 1, v_today) r
    join shifts s on s.id = r.shift_id
    join employees e on e.id = r.employee_id and e.active
    where not exists (select 1 from requests q where q.employee_id = r.employee_id and q.status = 'approved'
                        and q.type in ('leave_annual', 'leave_sick', 'leave_unpaid', 'leave_paid', 'business_trip')
                        and r.work_date between q.start_date and q.end_date and q.half_day is null)
  loop
    -- 1. nhắc check-in trước giờ vào ca
    if now() between rec.st - make_interval(mins => v_before) and rec.st
       and not exists (select 1 from attendance a where a.employee_id = rec.employee_id and a.work_date = rec.work_date and a.shift_id = rec.shift_id)
       and app.remind_once('ci:' || rec.employee_id || ':' || rec.work_date || ':' || rec.shift_id) then
      perform app.notify(rec.employee_id, 'reminder', 'Sắp vào ca ' || rec.name,
        'Ca bắt đầu lúc ' || to_char(rec.st at time zone app.tz(), 'HH24:MI') || '. Đừng quên check-in!', '/');
      v_count := v_count + 1;
    end if;

    -- 2. vắng mặt: quá giờ vào ca mà chưa check-in -> báo nhân viên và quản lý
    if now() between rec.st + make_interval(mins => v_absent) and rec.en
       and not exists (select 1 from attendance a where a.employee_id = rec.employee_id and a.work_date = rec.work_date)
       and app.remind_once('ab:' || rec.employee_id || ':' || rec.work_date || ':' || rec.shift_id) then
      perform app.notify(rec.employee_id, 'absent', 'Bạn chưa check-in ca ' || rec.name,
        'Nếu bạn đã đến nơi làm việc, hãy check-in ngay hoặc gửi đơn giải trình.', '/');
      perform app.notify(rec.manager_id, 'absent', rec.full_name || ' chưa check-in',
        'Ca ' || rec.name || ' bắt đầu lúc ' || to_char(rec.st at time zone app.tz(), 'HH24:MI'), '/admin');
      v_count := v_count + 1;
    end if;

    -- 3. nhắc check-out khi hết ca
    if now() between rec.en + make_interval(mins => v_after) and rec.en + interval '2 hours'
       and exists (select 1 from attendance a where a.employee_id = rec.employee_id and a.work_date = rec.work_date
                   and a.shift_id = rec.shift_id and a.check_out_at is null and not a.missing_checkout)
       and app.remind_once('co:' || rec.employee_id || ':' || rec.work_date || ':' || rec.shift_id) then
      perform app.notify(rec.employee_id, 'reminder', 'Hết ca ' || rec.name || ' – nhớ check-out',
        'Ca kết thúc lúc ' || to_char(rec.en at time zone app.tz(), 'HH24:MI') || '.', '/');
      v_count := v_count + 1;
    end if;
  end loop;

  -- 4. đánh dấu quên check-out
  for rec in
    update attendance a set missing_checkout = true, flags = array(select distinct f from unnest(a.flags || array['missing_checkout']) f)
    where a.check_out_at is null and not a.missing_checkout and a.check_in_at is not null
      and now() > coalesce(
        (select app.shift_end(a.work_date, s) from shifts s where s.id = a.shift_id),
        a.check_in_at + interval '8 hours') + make_interval(hours => v_missing)
      and not app.month_locked(to_char(a.work_date, 'YYYY-MM'))
    returning a.employee_id, a.work_date
  loop
    perform app.notify(rec.employee_id, 'missing_checkout', 'Bạn quên check-out ngày ' || to_char(rec.work_date, 'DD/MM'),
      'Hãy gửi đơn "Quên chấm công" để được tính đủ công.', '/requests/new?type=forgot_checkin&date=' || rec.work_date);
    v_count := v_count + 1;
  end loop;

  -- 5. công việc sắp đến hạn / quá hạn
  for rec in
    select t.* from tasks t
    where t.status in ('todo', 'doing') and t.due_at is not null
      and t.due_at between now() and now() + make_interval(hours => v_due)
  loop
    if app.remind_once('td:' || rec.id || ':' || rec.due_at) then
      perform app.notify(rec.assignee_id, 'task_due', 'Sắp đến hạn: ' || rec.title,
        'Hạn ' || to_char(rec.due_at at time zone app.tz(), 'HH24:MI DD/MM'), '/tasks/' || rec.id);
      v_count := v_count + 1;
    end if;
  end loop;
  for rec in
    select t.* from tasks t
    where t.status in ('todo', 'doing') and t.due_at is not null and t.due_at < now()
      and t.due_at > now() - interval '7 days'
  loop
    if app.remind_once('to:' || rec.id || ':' || rec.due_at) then
      perform app.notify(rec.assignee_id, 'task_overdue', 'Quá hạn: ' || rec.title, null, '/tasks/' || rec.id);
      if rec.created_by <> rec.assignee_id then
        perform app.notify(rec.created_by, 'task_overdue', 'Việc quá hạn: ' || rec.title, null, '/tasks/' || rec.id);
      end if;
      v_count := v_count + 1;
    end if;
  end loop;

  delete from app.reminder_log where created_at < now() - interval '30 days';
  return v_count;
end $$;
