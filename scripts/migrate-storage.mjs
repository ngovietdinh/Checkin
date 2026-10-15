// Sao chép toàn bộ file (selfie, đính kèm, ảnh đại diện) giữa 2 máy chủ Supabase.
//   SOURCE_URL=... SOURCE_SERVICE_KEY=... TARGET_URL=... TARGET_SERVICE_KEY=... node scripts/migrate-storage.mjs [--dry-run]
// File đã tồn tại ở đích sẽ được bỏ qua, nên chạy lại nhiều lần được.
import { createClient } from "@supabase/supabase-js";

const { SOURCE_URL, SOURCE_SERVICE_KEY, TARGET_URL, TARGET_SERVICE_KEY } = process.env;
const dry = process.argv.includes("--dry-run");
if (!SOURCE_URL || !SOURCE_SERVICE_KEY || (!dry && (!TARGET_URL || !TARGET_SERVICE_KEY))) {
  console.error("Cần SOURCE_URL, SOURCE_SERVICE_KEY, TARGET_URL, TARGET_SERVICE_KEY");
  process.exit(1);
}
const opts = { auth: { persistSession: false } };
const src = createClient(SOURCE_URL, SOURCE_SERVICE_KEY, opts);
const dst = dry ? null : createClient(TARGET_URL, TARGET_SERVICE_KEY, opts);
const BUCKETS = ["selfies", "attachments", "avatars"];

async function* walk(client, bucket, prefix = "") {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) yield* walk(client, bucket, path); // thư mục
      else yield { path, type: item.metadata?.mimetype };
    }
    if (data.length < 1000) break;
  }
}

let copied = 0, skipped = 0, failed = 0;
for (const bucket of BUCKETS) {
  for await (const f of walk(src, bucket)) {
    if (dry) { copied++; continue; }
    const { data: blob, error } = await src.storage.from(bucket).download(f.path);
    if (error) { failed++; console.error("  tải lỗi", bucket, f.path, error.message); continue; }
    const up = await dst.storage.from(bucket).upload(f.path, blob, { contentType: f.type, upsert: false });
    if (up.error) {
      if (/exists|Duplicate/i.test(up.error.message)) skipped++;
      else { failed++; console.error("  ghi lỗi", bucket, f.path, up.error.message); }
    } else copied++;
    if ((copied + skipped) % 200 === 0) console.log(`  … ${copied} đã chép, ${skipped} đã có`);
  }
  console.log(`Xong bucket ${bucket}`);
}
console.log(`${dry ? "[Chạy thử] Sẽ chép" : "Đã chép"} ${copied} file, bỏ qua ${skipped}, lỗi ${failed}`);
process.exit(failed ? 1 : 0);
