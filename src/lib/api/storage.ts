import { supabase, unwrap, ApiError } from "./client";

export type Bucket = "selfies" | "attachments" | "avatars";

export async function upload(bucket: Bucket, path: string, file: Blob, contentType?: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: contentType ?? (file as File).type ?? "application/octet-stream",
    upsert: bucket === "avatars",
  });
  if (error) throw new ApiError(error.message);
  return path;
}

const signedCache = new Map<string, { url: string; exp: number }>();

/** Đường dẫn tạm (1 giờ) để xem file riêng tư */
export async function signedUrl(bucket: Bucket, path: string): Promise<string> {
  const key = bucket + "/" + path;
  const hit = signedCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw new ApiError(error.message);
  signedCache.set(key, { url: data.signedUrl, exp: Date.now() + 3000_000 });
  return data.signedUrl;
}

export async function signedUrls(bucket: Bucket, paths: string[]): Promise<Record<string, string>> {
  const need = paths.filter((p) => !signedCache.has(bucket + "/" + p) || signedCache.get(bucket + "/" + p)!.exp < Date.now());
  if (need.length) {
    const data = unwrap(await supabase.storage.from(bucket).createSignedUrls(need, 3600));
    for (const d of data ?? []) if (d.signedUrl && d.path) signedCache.set(bucket + "/" + d.path, { url: d.signedUrl, exp: Date.now() + 3000_000 });
  }
  return Object.fromEntries(paths.map((p) => [p, signedCache.get(bucket + "/" + p)?.url ?? ""]));
}

export function publicUrl(bucket: Bucket, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function fileName(path: string) {
  return path.split("/").pop()?.replace(/^\d+-/, "") ?? path;
}
