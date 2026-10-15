import { supabase, unwrap, ApiError } from "./client";
import { config } from "../config";
import type { Employee } from "../types";

export function toLoginEmail(login: string) {
  const v = login.trim().toLowerCase();
  return v.includes("@") ? v : `${v.replace(/[^a-z0-9._-]/g, "")}@${config.loginEmailDomain}`;
}

export async function signIn(login: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(login), password });
  if (error) throw new ApiError(error.message);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function changePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new ApiError(error.message);
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export function onAuthChange(cb: (userId: string | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session?.user.id ?? null));
  return () => data.subscription.unsubscribe();
}

export async function getMyProfile(id: string): Promise<Employee | null> {
  return unwrap(await supabase.from("employees").select("*").eq("id", id).maybeSingle());
}

export async function updateMyProfile(p: { phone?: string; avatar_url?: string; telegram_chat_id?: string }) {
  return unwrap(await supabase.rpc("update_my_profile", {
    p_phone: p.phone ?? null, p_avatar_url: p.avatar_url ?? null, p_telegram_chat_id: p.telegram_chat_id ?? null,
  }));
}
