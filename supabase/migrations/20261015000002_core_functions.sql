-- =============================================================================
-- HÀM LÕI: phân quyền, lịch, chấm công, thông báo, nhật ký, khoá kỳ lương
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tiện ích chung
-- ---------------------------------------------------------------------------
create or replace function app.tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select data->>'timezone' from settings where id = 1), 'Asia/Ho_Chi_Minh')
$$;

create or replace function app.cfg(variadic p_path text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select data #> p_path from settings where id = 1
$$;

create or replace function app.today() returns date
language sql stable as $$ select (now() at time zone app.tz())::date $$;

create or replace function app.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

create or replace function app.raise_err(p_code text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_detail::text;
end $$;

-- ---------------------------------------------------------------------------
-- Phân quyền
-- ---------------------------------------------------------------------------
create or replace function app.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from employees where id = auth.uid() and active
$$;

create or replace function app.is_hr() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.my_role() in ('admin', 'hr'), false)
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.my_role() = 'admin', false)
$$;

-- Danh sách nhân viên mà người đang đăng nhập được xem:
-- bản thân + cấp dưới (đệ quy theo manager_id) + nhân viên phòng ban mình quản lý (gồm phòng con).
-- Admin/HR xem tất cả.
create or replace function app.visible_employee_ids() returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role app_role;
begin
  select role into v_role from employees where id = v_uid and active;
  if v_role is null then return '{}'; end if;
  if v_role in ('admin', 'hr') then
    return array(select id from employees);
  end if;
  return array(
    with recursive depts as (
      select id from departments where manager_id = v_uid
      union
      select d.id from departments d join depts on d.parent_id = depts.id
    ), subs as (
      select id from employees where manager_id = v_uid
      union
      select e.id from employees e join subs on e.manager_id = subs.id
    )
    select v_uid
    union select id from subs
    union select id from employees where department_id in (select id from depts)
  );
end $$;

create or replace function app.can_see(p_emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_emp = any(app.visible_employee_ids())
$$;

create or replace function app.is_manager_role() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.my_role() in ('admin', 'hr', 'manager', 'leader'), false)
$$;

-- ---------------------------------------------------------------------------
-- Thông báo
-- ---------------------------------------------------------------------------
create or replace function app.notify(p_user uuid, p_type text, p_title text, p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, link)
  select p_user, p_type, p_title, p_body, p_link
  where p_user is not null and exists (select 1 from employees where id = p_user and active)
$$;

create or replace function app.notify_hr(p_type text, p_title text, p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, link)
  select id, p_type, p_title, p_body, p_link from employees where active and role in ('admin', 'hr')
$$;

-- ---------------------------------------------------------------------------
-- Lịch làm việc đã "giải" (lịch cụ thể ưu tiên hơn lịch mặc định)
-- ---------------------------------------------------------------------------
create or replace function app.resolve_schedule(p_emps uuid[], p_from date, p_to date)
returns table (employee_id uuid, work_date date, shift_id uuid, branch_id uuid, is_default boolean)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ), emps as (
    select * from employees
    where (p_emps is null or id = any(p_emps))
  ), explicit as (
    select s.* from schedules s
    join emps e on e.id = s.employee_id
    where s.work_date between p_from and p_to
  )
  select x.employee_id, x.work_date, x.shift_id, x.branch_id, false
  from explicit x
  join emps e on e.id = x.employee_id
  where not x.is_off
    and x.work_date >= e.join_date and (e.left_date is null or x.work_date <= e.left_date)
  union all
  select e.id, days.d, e.default_shift_id, null::uuid, true
  from emps e cross join days
  where e.default_shift_id is not null
    and e.active
    and extract(isodow from days.d)::int = any(e.work_days)
    and days.d >= e.join_date and (e.left_date is null or days.d <= e.left_date)
    and not exists (select 1 from holidays h where h.holiday_date = days.d)
    and not exists (select 1 from explicit x where x.employee_id = e.id and x.work_date = days.d)
$$;

-- API: lịch đã giải cho các nhân viên được phép xem
create or replace function public.get_schedule(p_from date, p_to date, p_emps uuid[] default null)
returns table (employee_id uuid, work_date date, shift_id uuid, branch_id uuid, is_default boolean)
language sql stable security definer set search_path = public as $$
  select r.* from app.resolve_schedule(
    case when p_emps is null then app.visible_employee_ids()
         else array(select unnest(p_emps) intersect select unnest(app.visible_employee_ids())) end,
    p_from, p_to) r
  order by r.work_date, r.employee_id
$$;

create or replace function app.shift_start(p_date date, p_shift public.shifts) returns timestamptz
language sql stable as $$ select (p_date + p_shift.start_time) at time zone app.tz() $$;

create or replace function app.shift_end(p_date date, p_shift public.shifts) returns timestamptz
language sql stable as $$
  select (p_date + p_shift.end_time + case when p_shift.is_overnight then interval '1 day' else interval '0' end)
         at time zone app.tz()
$$;

-- ---------------------------------------------------------------------------
-- Tính toán chấm công (trigger) – áp dụng cho cả chấm qua app, sửa tay, duyệt đơn
-- ---------------------------------------------------------------------------
create or replace function app.attendance_compute() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_shift shifts;
  v_start timestamptz;
  v_end timestamptz;
  v_in timestamptz;
  v_out timestamptz;
  v_span int;
begin
  new.late_minutes := 0;
  new.early_minutes := 0;
  new.worked_minutes := 0;
  if new.shift_id is not null then
    select * into v_shift from shifts where id = new.shift_id;
  end if;

  if v_shift.id is null then
    if new.check_in_at is not null and new.check_out_at is not null then
      new.worked_minutes := greatest(0, floor(extract(epoch from new.check_out_at - new.check_in_at) / 60))::int;
    end if;
  else
    v_start := app.shift_start(new.work_date, v_shift);
    v_end := app.shift_end(new.work_date, v_shift);
    if new.check_in_at is not null then
      v_span := floor(extract(epoch from new.check_in_at - v_start) / 60)::int;
      if v_span > v_shift.late_grace_min then new.late_minutes := v_span; end if;
    end if;
    if new.check_out_at is not null then
      v_span := floor(extract(epoch from v_end - new.check_out_at) / 60)::int;
      if v_span > v_shift.early_grace_min then new.early_minutes := v_span; end if;
    end if;
    if new.check_in_at is not null and new.check_out_at is not null then
      v_in := greatest(new.check_in_at, v_start);
      v_out := least(new.check_out_at, v_end);
      v_span := greatest(0, floor(extract(epoch from v_out - v_in) / 60))::int;
      -- trừ giờ nghỉ giữa ca nếu làm quá 4 tiếng
      if v_span > 240 then v_span := greatest(0, v_span - v_shift.break_minutes); end if;
      new.worked_minutes := v_span;
    end if;
  end if;

  if new.check_out_at is not null then new.missing_checkout := false; end if;
  new.updated_at := now();
  return new;
end $$;

create trigger attendance_compute before insert or update of check_in_at, check_out_at, shift_id, work_date
  on public.attendance for each row execute function app.attendance_compute();

-- ---------------------------------------------------------------------------
-- Khoá kỳ lương: không cho sửa dữ liệu của tháng đã chốt
-- ---------------------------------------------------------------------------
create or replace function app.month_locked(p_month text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payroll_periods where month = p_month and status in ('locked', 'published'))
$$;

create or replace function app.guard_locked_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and app.month_locked(to_char(old.work_date, 'YYYY-MM')) then
    perform app.raise_err('PERIOD_LOCKED', jsonb_build_object('month', to_char(old.work_date, 'YYYY-MM')));
  end if;
  if tg_op in ('INSERT', 'UPDATE') and app.month_locked(to_char(new.work_date, 'YYYY-MM')) then
    perform app.raise_err('PERIOD_LOCKED', jsonb_build_object('month', to_char(new.work_date, 'YYYY-MM')));
  end if;
  return coalesce(new, old);
end $$;

create trigger attendance_guard_locked before insert or update or delete on public.attendance
  for each row execute function app.guard_locked_attendance();

create or replace function app.guard_locked_month_col() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and app.month_locked(old.month) then
    perform app.raise_err('PERIOD_LOCKED', jsonb_build_object('month', old.month));
  end if;
  if tg_op in ('INSERT', 'UPDATE') and app.month_locked(new.month) then
    perform app.raise_err('PERIOD_LOCKED', jsonb_build_object('month', new.month));
  end if;
  return coalesce(new, old);
end $$;

create trigger payslips_guard_locked before insert or update or delete on public.payslips
  for each row execute function app.guard_locked_month_col();
create trigger adjustments_guard_locked before insert or update or delete on public.payroll_adjustments
  for each row execute function app.guard_locked_month_col();

-- ---------------------------------------------------------------------------
-- Định vị: tìm chi nhánh gần nhất được phép, báo lỗi nếu ngoài vùng
-- ---------------------------------------------------------------------------
create or replace function app.locate(p_emp uuid, p_lat float8, p_lng float8, p_accuracy float8,
                                      out branch_id uuid, out distance_m float8)
language plpgsql stable security definer set search_path = public as $$
declare
  v_max_acc float8 := coalesce((app.cfg('attendance', 'max_gps_accuracy_m'))::text::float8, 100);
  v_best record;
begin
  if p_lat is null or p_lng is null then perform app.raise_err('GPS_REQUIRED'); end if;
  if p_accuracy is null or p_accuracy > v_max_acc then
    perform app.raise_err('GPS_INACCURATE', jsonb_build_object('accuracy', round(coalesce(p_accuracy, -1)::numeric), 'max', v_max_acc));
  end if;

  select b.id, b.name, b.radius_m, app.distance_m(p_lat, p_lng, b.lat, b.lng) as dist
    into v_best
  from employee_branches eb join branches b on b.id = eb.branch_id
  where eb.employee_id = p_emp and b.active
  order by dist asc limit 1;

  if v_best.id is null then perform app.raise_err('NO_BRANCH'); end if;
  if v_best.dist > v_best.radius_m then
    perform app.raise_err('OUT_OF_RANGE', jsonb_build_object(
      'distance', round(v_best.dist::numeric), 'radius', v_best.radius_m, 'branch', v_best.name));
  end if;
  branch_id := v_best.id;
  distance_m := round(v_best.dist::numeric, 1);
end $$;

-- Kiểm tra thiết bị đã đăng ký
create or replace function app.check_device(p_emp public.employees, p_device_id text, p_device_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((app.cfg('attendance', 'device_binding'))::text::boolean, true) then return; end if;
  if p_device_id is null or length(p_device_id) < 8 then perform app.raise_err('DEVICE_REQUIRED'); end if;
  if p_emp.device_id is null then
    update employees set device_id = p_device_id, device_label = p_device_label, device_bound_at = now()
    where id = p_emp.id;
  elsif p_emp.device_id <> p_device_id then
    perform app.raise_err('DEVICE_MISMATCH', jsonb_build_object('bound_label', p_emp.device_label));
  end if;
end $$;

-- Cờ nghi vấn gian lận vị trí
create or replace function app.location_flags(p_emp uuid, p_lat float8, p_lng float8, p_accuracy float8, p_meta jsonb)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  v_flags text[] := '{}';
  v_last record;
  v_hours float8;
  v_km float8;
  v_max_speed float8 := coalesce((app.cfg('attendance', 'max_travel_speed_kmh'))::text::float8, 150);
begin
  if coalesce((p_meta->>'mocked')::boolean, false) then v_flags := v_flags || 'mock_location'; end if;
  if p_accuracy is not null and p_accuracy < 1 then v_flags := v_flags || 'gps_too_precise'; end if;
  if (p_meta->>'position_age_ms')::float8 > 60000 then v_flags := v_flags || 'stale_position'; end if;

  -- vị trí "nhảy" bất thường so với lần chấm gần nhất
  select ts, lat, lng into v_last from (
    select check_in_at ts, in_lat lat, in_lng lng from attendance
      where employee_id = p_emp and in_lat is not null and check_in_at > now() - interval '12 hours'
    union all
    select check_out_at, out_lat, out_lng from attendance
      where employee_id = p_emp and out_lat is not null and check_out_at > now() - interval '12 hours'
  ) t order by ts desc limit 1;
  if v_last.ts is not null then
    v_hours := greatest(extract(epoch from now() - v_last.ts) / 3600, 1.0 / 60);
    v_km := app.distance_m(p_lat, p_lng, v_last.lat, v_last.lng) / 1000;
    if v_km > 1 and v_km / v_hours > v_max_speed then v_flags := v_flags || 'impossible_travel'; end if;
  end if;
  return v_flags;
end $$;

-- ---------------------------------------------------------------------------
-- API: CHECK-IN
-- ---------------------------------------------------------------------------
create or replace function public.check_in(
  p_lat float8, p_lng float8, p_accuracy float8,
  p_selfie text default null, p_device_id text default null, p_device_label text default null,
  p_meta jsonb default '{}'::jsonb
) returns public.attendance
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_emp employees;
  v_cfg jsonb := app.cfg('attendance');
  v_today date := app.today();
  v_loc record;
  v_cand record;
  v_shift shifts;
  v_best_shift shifts;
  v_best_date date;
  v_best_branch uuid;
  v_best_start timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_open_before int := coalesce((v_cfg->>'checkin_open_before_min')::int, 120);
  v_flags text[];
  v_rec attendance;
begin
  select * into v_emp from employees where id = v_uid and active;
  if not found then perform app.raise_err('NOT_EMPLOYEE'); end if;

  perform app.check_device(v_emp, p_device_id, p_device_label);

  if exists (select 1 from attendance where employee_id = v_uid and check_out_at is null
             and not missing_checkout and check_in_at > now() - interval '24 hours') then
    perform app.raise_err('ALREADY_CHECKED_IN');
  end if;

  select * into v_loc from app.locate(v_uid, p_lat, p_lng, p_accuracy);

  if coalesce((v_cfg->>'require_selfie_checkin')::boolean, true)
     and (p_selfie is null or p_selfie not like v_uid::text || '/%') then
    perform app.raise_err('SELFIE_REQUIRED');
  end if;

  -- chọn ca phù hợp (ca hôm nay hoặc ca đêm hôm qua) đang mở và chưa chấm
  for v_cand in
    select r.work_date, r.shift_id, r.branch_id
    from app.resolve_schedule(array[v_uid], v_today - 1, v_today) r
  loop
    select * into v_shift from shifts where id = v_cand.shift_id;
    v_start := app.shift_start(v_cand.work_date, v_shift);
    v_end := app.shift_end(v_cand.work_date, v_shift);
    continue when now() < v_start - make_interval(mins => v_open_before) or now() > v_end;
    continue when exists (select 1 from attendance a where a.employee_id = v_uid
                          and a.work_date = v_cand.work_date and a.shift_id = v_cand.shift_id);
    if v_best_start is null or v_start < v_best_start then
      v_best_start := v_start; v_best_shift := v_shift;
      v_best_date := v_cand.work_date; v_best_branch := v_cand.branch_id;
    end if;
  end loop;

  v_flags := app.location_flags(v_uid, p_lat, p_lng, p_accuracy, p_meta);

  if v_best_shift.id is null then
    if not coalesce((v_cfg->>'allow_unscheduled_checkin')::boolean, true) then
      perform app.raise_err('NO_SHIFT');
    end if;
    v_flags := v_flags || 'unscheduled';
    v_best_date := v_today;
  elsif v_best_branch is not null and v_best_branch <> v_loc.branch_id then
    v_flags := v_flags || 'other_branch';
  end if;

  insert into attendance (employee_id, work_date, shift_id, branch_id, check_in_at,
                          in_lat, in_lng, in_accuracy, in_distance_m, in_selfie, device_id, flags)
  values (v_uid, v_best_date, v_best_shift.id, v_loc.branch_id, now(),
          p_lat, p_lng, p_accuracy, v_loc.distance_m, p_selfie, p_device_id, v_flags)
  returning * into v_rec;

  if v_rec.late_minutes > 0 and coalesce((v_cfg->>'notify_manager_on_late')::boolean, true) then
    perform app.notify(v_emp.manager_id, 'late', v_emp.full_name || ' đi muộn ' || v_rec.late_minutes || ' phút',
      'Ca ' || v_best_shift.name || ' – check-in lúc ' || to_char(now() at time zone app.tz(), 'HH24:MI'),
      '/admin/attendance');
  end if;
  if cardinality(array_remove(v_flags, 'unscheduled')) > 0 then
    perform app.notify(v_emp.manager_id, 'suspicious', 'Chấm công cần kiểm tra: ' || v_emp.full_name,
      array_to_string(v_flags, ', '), '/admin/attendance');
  end if;

  return v_rec;
end $$;

-- ---------------------------------------------------------------------------
-- API: CHECK-OUT
-- ---------------------------------------------------------------------------
create or replace function public.check_out(
  p_lat float8 default null, p_lng float8 default null, p_accuracy float8 default null,
  p_selfie text default null, p_device_id text default null, p_meta jsonb default '{}'::jsonb
) returns public.attendance
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_emp employees;
  v_cfg jsonb := app.cfg('attendance');
  v_rec attendance;
  v_dist float8;
  v_branch uuid;
  v_flags text[] := '{}';
begin
  select * into v_emp from employees where id = v_uid and active;
  if not found then perform app.raise_err('NOT_EMPLOYEE'); end if;
  perform app.check_device(v_emp, p_device_id, v_emp.device_label);

  select * into v_rec from attendance
  where employee_id = v_uid and check_out_at is null and not missing_checkout
    and check_in_at > now() - interval '24 hours'
  order by check_in_at desc limit 1 for update;
  if not found then perform app.raise_err('NOT_CHECKED_IN'); end if;

  if coalesce((v_cfg->>'require_location_checkout')::boolean, true) then
    select l.branch_id, l.distance_m into v_branch, v_dist from app.locate(v_uid, p_lat, p_lng, p_accuracy) l;
    v_flags := app.location_flags(v_uid, p_lat, p_lng, p_accuracy, p_meta);
  end if;

  if coalesce((v_cfg->>'require_selfie_checkout')::boolean, false)
     and (p_selfie is null or p_selfie not like v_uid::text || '/%') then
    perform app.raise_err('SELFIE_REQUIRED');
  end if;

  if coalesce((v_cfg->>'require_report_before_checkout')::boolean, false)
     and not exists (select 1 from daily_reports where employee_id = v_uid and report_date = v_rec.work_date) then
    perform app.raise_err('REPORT_REQUIRED');
  end if;

  update attendance set
    check_out_at = now(),
    out_lat = p_lat, out_lng = p_lng, out_accuracy = p_accuracy, out_distance_m = v_dist,
    out_selfie = p_selfie,
    flags = array(select distinct f from unnest(flags || v_flags) f)
  where id = v_rec.id
  returning * into v_rec;
  return v_rec;
end $$;

-- ---------------------------------------------------------------------------
-- API: trạng thái hôm nay (cho app nhân viên)
-- ---------------------------------------------------------------------------
create or replace function public.my_today()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := app.today();
begin
  return jsonb_build_object(
    'today', v_today,
    'server_time', now(),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'work_date', r.work_date, 'shift_id', s.id, 'name', s.name, 'code', s.code, 'color', s.color,
        'start', app.shift_start(r.work_date, s), 'end', app.shift_end(r.work_date, s))
        order by app.shift_start(r.work_date, s))
      from app.resolve_schedule(array[v_uid], v_today - 1, v_today) r join shifts s on s.id = r.shift_id
      where app.shift_end(r.work_date, s) > now() - interval '6 hours'
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.check_in_at)
      from attendance a where a.employee_id = v_uid and a.work_date between v_today - 1 and v_today
    ), '[]'::jsonb),
    'open', (
      select to_jsonb(a) from attendance a
      where a.employee_id = v_uid and a.check_out_at is null and not a.missing_checkout
        and a.check_in_at > now() - interval '24 hours'
      order by a.check_in_at desc limit 1
    ),
    'leave', (
      select jsonb_build_object('type', type, 'half_day', half_day) from requests
      where employee_id = v_uid and status = 'approved'
        and type in ('leave_annual', 'leave_sick', 'leave_unpaid', 'leave_paid', 'business_trip')
        and v_today between start_date and end_date
      limit 1
    ),
    'report_submitted', exists (select 1 from daily_reports where employee_id = v_uid and report_date = v_today),
    'device_bound', (select device_id is not null from employees where id = v_uid)
  );
end $$;

-- ---------------------------------------------------------------------------
-- API: bảng trạng thái theo ngày cho quản lý
-- ---------------------------------------------------------------------------
create or replace function public.day_status(p_date date default null)
returns table (
  employee_id uuid, code text, full_name text, department_id uuid, avatar_url text,
  shift_names text, shift_start timestamptz, shift_end timestamptz,
  check_in_at timestamptz, check_out_at timestamptz, late_minutes int, early_minutes int,
  branch_id uuid, in_lat float8, in_lng float8, in_selfie text, flags text[],
  leave_type public.request_type, status text
) language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_date, app.today()) as d),
  vis as (select unnest(app.visible_employee_ids()) as id),
  sch as (
    select r.employee_id,
           string_agg(s.name, ', ' order by s.start_time) as names,
           min(app.shift_start(r.work_date, s)) as st,
           max(app.shift_end(r.work_date, s)) as en
    from app.resolve_schedule(array(select id from vis), (select d from d), (select d from d)) r
    join shifts s on s.id = r.shift_id
    group by r.employee_id
  ),
  att as (
    select a.employee_id,
           min(a.check_in_at) as cin,
           case when bool_or(a.check_out_at is null) then null else max(a.check_out_at) end as cout,
           sum(a.late_minutes)::int as late, sum(a.early_minutes)::int as early,
           (array_agg(a.branch_id order by a.check_in_at desc))[1] as branch_id,
           (array_agg(a.in_lat order by a.check_in_at desc))[1] as lat,
           (array_agg(a.in_lng order by a.check_in_at desc))[1] as lng,
           (array_agg(a.in_selfie order by a.check_in_at desc))[1] as selfie,
           bool_or(a.missing_checkout) as missing
    from attendance a
    where a.work_date = (select d from d) and a.employee_id in (select id from vis)
    group by a.employee_id
  ),
  lv as (
    select distinct on (employee_id) employee_id, type from requests
    where status = 'approved' and (select d from d) between start_date and end_date
      and type in ('leave_annual', 'leave_sick', 'leave_unpaid', 'leave_paid', 'business_trip')
      and employee_id in (select id from vis)
  )
  select e.id, e.code, e.full_name, e.department_id, e.avatar_url,
         sch.names, sch.st, sch.en,
         att.cin, att.cout, coalesce(att.late, 0), coalesce(att.early, 0),
         att.branch_id, att.lat, att.lng, att.selfie,
         array(select distinct f from attendance a2, unnest(a2.flags) f
               where a2.employee_id = e.id and a2.work_date = (select d from d)),
         lv.type,
         case
           when att.cin is not null and att.missing then 'missing_checkout'
           when att.cin is not null and att.cout is null then 'working'
           when att.cin is not null then 'done'
           when lv.type is not null then 'leave'
           when sch.st is null then 'off'
           when now() > sch.st + make_interval(mins => coalesce((app.cfg('reminders', 'absent_after_min'))::text::int, 30)) then 'absent'
           else 'not_yet'
         end
  from employees e
  join vis on vis.id = e.id
  left join sch on sch.employee_id = e.id
  left join att on att.employee_id = e.id
  left join lv on lv.employee_id = e.id
  where e.active
  order by e.full_name
$$;

-- ---------------------------------------------------------------------------
-- Nhật ký thao tác
-- ---------------------------------------------------------------------------
create or replace function app.write_audit(p_op text, p_table text, p_old jsonb, p_new jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), lower(p_op), p_table,
          coalesce(p_new->>'id', p_old->>'id', p_new->>'employee_id', p_old->>'employee_id', p_new->>'month', p_old->>'month'),
          case when p_op <> 'INSERT' then p_old end,
          case when p_op <> 'DELETE' then p_new end);
end $$;

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.write_audit(tg_op, tg_table_name,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Chấm công: chỉ ghi nhật ký thao tác sửa của người khác (HR sửa tay, duyệt đơn), không ghi check-in/out qua app
create or replace function app.audit_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.source = 'app' then return new; end if;
  if tg_op = 'UPDATE' and new.employee_id = auth.uid() then return new; end if;
  perform app.write_audit(tg_op, tg_table_name,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_attendance after insert or update or delete on public.attendance
  for each row execute function app.audit_attendance();
create trigger audit_employees after insert or update or delete on public.employees
  for each row execute function app.audit();
create trigger audit_compensation after insert or update or delete on public.employee_compensation
  for each row execute function app.audit();
create trigger audit_allowances after insert or update or delete on public.employee_allowances
  for each row execute function app.audit();
create trigger audit_adjustments after insert or update or delete on public.payroll_adjustments
  for each row execute function app.audit();
create trigger audit_periods after insert or update or delete on public.payroll_periods
  for each row execute function app.audit();
create trigger audit_payslips after update or delete on public.payslips
  for each row execute function app.audit();
create trigger audit_settings after update on public.settings
  for each row execute function app.audit();
create trigger audit_branches after insert or update or delete on public.branches
  for each row execute function app.audit();
create trigger audit_shifts after insert or update or delete on public.shifts
  for each row execute function app.audit();

-- updated_at
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger touch_employees before update on public.employees for each row execute function app.touch_updated_at();
create trigger touch_comp before update on public.employee_compensation for each row execute function app.touch_updated_at();
create trigger touch_requests before update on public.requests for each row execute function app.touch_updated_at();
create trigger touch_tasks before update on public.tasks for each row execute function app.touch_updated_at();
create trigger touch_reports before update on public.daily_reports for each row execute function app.touch_updated_at();
create trigger touch_settings before update on public.settings for each row execute function app.touch_updated_at();
