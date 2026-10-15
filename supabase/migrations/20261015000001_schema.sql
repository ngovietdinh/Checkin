-- =============================================================================
-- CHẤM CÔNG – SCHEMA
-- Chỉ dùng PostgreSQL chuẩn + các phần của Supabase (auth.users, auth.uid(),
-- storage). Toàn bộ chạy được trên Supabase Cloud lẫn Supabase tự host (VPS).
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Kiểu dữ liệu
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'hr', 'manager', 'leader', 'employee');
create type public.salary_type as enum ('monthly', 'hourly', 'shift');
create type public.request_type as enum (
  'leave_annual',      -- nghỉ phép năm (có lương, trừ quỹ phép)
  'leave_sick',        -- nghỉ ốm (BHXH chi trả, không tính lương công ty)
  'leave_unpaid',      -- nghỉ không lương
  'leave_paid',        -- nghỉ có lương khác (cưới, tang...)
  'ot',                -- tăng ca
  'late',              -- xin đi muộn / giải trình đi muộn
  'early',             -- xin về sớm
  'business_trip',     -- công tác
  'forgot_checkin',    -- quên chấm công
  'shift_swap',        -- đổi ca
  'device_change'      -- đổi thiết bị chấm công
);
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.task_status as enum ('todo', 'doing', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.payroll_status as enum ('draft', 'locked', 'published');
create type public.adjustment_type as enum ('bonus', 'allowance', 'penalty', 'advance', 'deduction');

-- ---------------------------------------------------------------------------
-- Cài đặt chung (1 dòng duy nhất)
-- ---------------------------------------------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.settings (id, data) values (1, $json$
{
  "company_name": "Công ty của bạn",
  "timezone": "Asia/Ho_Chi_Minh",
  "attendance": {
    "max_gps_accuracy_m": 100,
    "require_selfie_checkin": true,
    "require_selfie_checkout": false,
    "require_location_checkout": true,
    "require_report_before_checkout": false,
    "device_binding": true,
    "allow_unscheduled_checkin": true,
    "checkin_open_before_min": 120,
    "missing_checkout_after_hours": 4,
    "notify_manager_on_late": true,
    "max_travel_speed_kmh": 150
  },
  "reminders": {
    "checkin_before_min": 15,
    "checkout_after_min": 5,
    "absent_after_min": 30,
    "task_due_hours": 24
  },
  "leave": {
    "annual_quota_default": 12,
    "accrue_monthly": true,
    "seniority_bonus_every_years": 5
  },
  "approval_flows": {
    "default": ["direct_manager", "hr"],
    "ot": ["direct_manager"],
    "late": ["direct_manager"],
    "early": ["direct_manager"],
    "forgot_checkin": ["direct_manager"],
    "shift_swap": ["swap_partner", "direct_manager"],
    "device_change": ["hr"]
  },
  "payroll": {
    "standard_days_mode": "schedule",
    "standard_days_fixed": 26,
    "hours_per_day": 8,
    "ot_rates": { "weekday": 1.5, "weekend": 2.0, "holiday": 3.0 },
    "missing_checkout_credit": 0.5,
    "late_penalty_per_time": 0,
    "late_penalty_per_minute": 0,
    "early_penalty_per_time": 0,
    "absence_penalty_per_day": 0,
    "insurance": {
      "enabled": true,
      "bhxh": 0.08, "bhyt": 0.015, "bhtn": 0.01,
      "base_cap": 46800000,
      "bhtn_cap": 106200000
    },
    "union_fee_rate": 0,
    "tax": {
      "enabled": true,
      "personal_deduction": 15500000,
      "dependent_deduction": 6200000,
      "brackets": [
        { "upto": 5000000,  "rate": 0.05 },
        { "upto": 10000000, "rate": 0.10 },
        { "upto": 18000000, "rate": 0.15 },
        { "upto": 32000000, "rate": 0.20 },
        { "upto": 52000000, "rate": 0.25 },
        { "upto": 80000000, "rate": 0.30 },
        { "upto": null,     "rate": 0.35 }
      ]
    }
  },
  "notifications": {
    "telegram_enabled": false,
    "email_enabled": false
  }
}
$json$::jsonb);

-- ---------------------------------------------------------------------------
-- Tổ chức
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 100 check (radius_m between 10 and 5000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.departments(id) on delete set null,
  manager_id uuid, -- FK thêm sau khi có bảng employees
  created_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  start_time time not null,
  end_time time not null,
  break_minutes int not null default 0 check (break_minutes >= 0),
  work_value numeric(4,2) not null default 1, -- số công của ca
  late_grace_min int not null default 5,
  early_grace_min int not null default 5,
  color text not null default '#2563eb',
  active boolean not null default true,
  -- ca qua đêm khi giờ kết thúc <= giờ bắt đầu
  is_overnight boolean generated always as (end_time <= start_time) stored
);

-- ---------------------------------------------------------------------------
-- Nhân sự
-- ---------------------------------------------------------------------------
create table public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  full_name text not null,
  email text,
  phone text,
  gender text check (gender in ('male', 'female', 'other')),
  dob date,
  avatar_url text,
  face_photo_url text, -- ảnh chuẩn để đối chiếu selfie
  role public.app_role not null default 'employee',
  department_id uuid references public.departments(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  manager_id uuid references public.employees(id) on delete set null, -- người duyệt trực tiếp
  join_date date not null default current_date,
  left_date date, -- ngày nghỉ việc
  active boolean not null default true,
  -- lịch mặc định khi không xếp lịch cụ thể
  default_shift_id uuid references public.shifts(id) on delete set null,
  work_days smallint[] not null default '{1,2,3,4,5}', -- ISO: 1=Thứ 2 ... 7=CN
  annual_leave_days numeric(4,1), -- null = theo mặc định công ty
  -- thiết bị chấm công
  device_id text,
  device_label text,
  device_bound_at timestamptz,
  telegram_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.departments
  add constraint departments_manager_fk foreign key (manager_id)
  references public.employees(id) on delete set null;

create index on public.employees (department_id);
create index on public.employees (manager_id);

-- Thông tin lương: tách bảng riêng để quản lý trực tiếp không xem được
create table public.employee_compensation (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  salary_type public.salary_type not null default 'monthly',
  base_salary numeric(14,0) not null default 0,    -- lương tháng
  hourly_rate numeric(14,0) not null default 0,    -- lương giờ
  shift_rate numeric(14,0) not null default 0,     -- lương mỗi ca
  insurance_salary numeric(14,0),                  -- lương đóng BH (null = base_salary)
  dependents int not null default 0,               -- người phụ thuộc
  tax_code text,
  bank_name text,
  bank_account text,
  insurance_enabled boolean not null default true,
  tax_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Phụ cấp cố định hàng tháng
create table public.employee_allowances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  name text not null,
  amount numeric(14,0) not null check (amount >= 0),
  taxable boolean not null default false,
  per_workday boolean not null default false -- true: amount là mức/ngày công
);
create index on public.employee_allowances (employee_id);

create table public.employee_branches (
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  primary key (employee_id, branch_id)
);
create index on public.employee_branches (branch_id);

-- ---------------------------------------------------------------------------
-- Lịch làm việc
-- ---------------------------------------------------------------------------
create table public.holidays (
  holiday_date date primary key,
  name text not null,
  paid boolean not null default true -- nghỉ lễ hưởng lương
);

-- Lịch cụ thể; nếu một ngày có dòng is_off=true thì là ngày nghỉ.
-- Nếu ngày không có dòng nào -> dùng lịch mặc định (default_shift_id + work_days).
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  shift_id uuid references public.shifts(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  is_off boolean not null default false,
  note text,
  created_by uuid default auth.uid(),
  check ((is_off and shift_id is null) or (not is_off and shift_id is not null))
);
create unique index schedules_unique on public.schedules (employee_id, work_date, coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on public.schedules (work_date);

-- ---------------------------------------------------------------------------
-- Chấm công
-- ---------------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  shift_id uuid references public.shifts(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  in_lat double precision, in_lng double precision, in_accuracy double precision, in_distance_m double precision,
  out_lat double precision, out_lng double precision, out_accuracy double precision, out_distance_m double precision,
  in_selfie text, out_selfie text,
  device_id text,
  late_minutes int not null default 0,
  early_minutes int not null default 0,
  worked_minutes int not null default 0,
  missing_checkout boolean not null default false,
  excused_late boolean not null default false,
  excused_early boolean not null default false,
  flags text[] not null default '{}',
  source text not null default 'app' check (source in ('app', 'manual', 'request')),
  note text,
  reviewed_by uuid references public.employees(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.attendance (employee_id, work_date);
create index on public.attendance (work_date);
create index attendance_open on public.attendance (employee_id) where check_out_at is null;

-- ---------------------------------------------------------------------------
-- Đơn từ
-- ---------------------------------------------------------------------------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  type public.request_type not null,
  start_date date not null,
  end_date date not null,
  half_day text check (half_day in ('am', 'pm')),
  start_time time,
  end_time time,
  hours numeric(5,2),
  days numeric(5,1),
  reason text,
  attachment text,
  payload jsonb not null default '{}'::jsonb,
  status public.request_status not null default 'pending',
  steps jsonb not null default '[]'::jsonb, -- [{type, approver_id, action, by, at, comment}]
  current_step int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on public.requests (employee_id, start_date);
create index on public.requests (status);

create table public.leave_carryovers (
  employee_id uuid not null references public.employees(id) on delete cascade,
  year int not null,
  days numeric(4,1) not null default 0,
  primary key (employee_id, year)
);

-- ---------------------------------------------------------------------------
-- Công việc & báo cáo
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assignee_id uuid not null references public.employees(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.employees(id) on delete set null,
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'todo',
  progress int not null default 0 check (progress between 0 and 100),
  attachments text[] not null default '{}',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks (assignee_id, status);
create index on public.tasks (created_by);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.employees(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index on public.task_comments (task_id);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null default auth.uid() references public.employees(id) on delete cascade,
  report_date date not null,
  done text not null default '',
  doing text not null default '',
  issues text not null default '',
  plan text not null default '',
  attachments text[] not null default '{}',
  score smallint check (score between 1 and 5),
  manager_comment text,
  reviewed_by uuid references public.employees(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, report_date)
);
create index on public.daily_reports (report_date);

-- ---------------------------------------------------------------------------
-- Lương
-- ---------------------------------------------------------------------------
create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  type public.adjustment_type not null,
  amount numeric(14,0) not null check (amount >= 0),
  taxable boolean not null default true,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.payroll_adjustments (month);

create table public.payroll_periods (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  status public.payroll_status not null default 'draft',
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  published_at timestamptz
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  month text not null references public.payroll_periods(month) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  gross numeric(14,0) not null default 0,
  net numeric(14,0) not null default 0,
  detail jsonb not null default '{}'::jsonb, -- toàn bộ chi tiết tính lương
  manual_override jsonb,                     -- các chỉnh sửa tay của HR
  computed_at timestamptz not null default now(),
  unique (month, employee_id)
);

-- ---------------------------------------------------------------------------
-- Thông báo
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index notifications_unsent on public.notifications (created_at) where push_sent_at is null;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target text not null default 'all' check (target in ('all', 'department', 'branch')),
  target_ids uuid[] not null default '{}',
  pinned boolean not null default false,
  created_by uuid default auth.uid() references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Chống gửi nhắc nhở trùng
create table app.reminder_log (
  key text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Nhật ký thao tác
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (entity, entity_id);
create index on public.audit_logs (created_at desc);
