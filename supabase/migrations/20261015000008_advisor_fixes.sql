-- =============================================================================
-- Xử lý cảnh báo của Supabase Security Advisor
-- 1. Cố định search_path cho các hàm tiện ích (tất cả tham chiếu bên trong đã ghi rõ schema).
-- 2. Khách chưa đăng nhập (anon) không được gọi review_attendance, update_my_profile.
-- =============================================================================

alter function app.today() set search_path = pg_catalog, public;
alter function app.distance_m(float8, float8, float8, float8) set search_path = pg_catalog, public;
alter function app.raise_err(text, jsonb) set search_path = pg_catalog, public;
alter function app.touch_updated_at() set search_path = pg_catalog, public;
alter function app.shift_start(date, public.shifts) set search_path = pg_catalog, public;
alter function app.shift_end(date, public.shifts) set search_path = pg_catalog, public;
alter function app.request_label(public.request_type) set search_path = pg_catalog, public;

revoke execute on function public.update_my_profile(text, text, text) from public, anon;
revoke execute on function public.review_attendance(uuid, text, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated, service_role;
grant execute on function public.review_attendance(uuid, text, boolean) to authenticated, service_role;
