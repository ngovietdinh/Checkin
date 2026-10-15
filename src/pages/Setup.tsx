export default function Setup() {
  return (
    <div className="mx-auto max-w-2xl p-6 text-sm leading-relaxed">
      <h1 className="mb-2 text-2xl font-semibold">Chưa cấu hình máy chủ</h1>
      <p>Ứng dụng chưa có địa chỉ Supabase. Chọn một trong hai cách:</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>Sửa file <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">config.js</code> trong thư mục đã build, điền <code>supabaseUrl</code> và <code>supabaseAnonKey</code>.</li>
        <li>Hoặc tạo file <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">.env.local</code> với <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code> rồi build lại.</li>
      </ol>
      <p className="mt-3">Xem hướng dẫn chi tiết trong README.md.</p>
    </div>
  );
}
