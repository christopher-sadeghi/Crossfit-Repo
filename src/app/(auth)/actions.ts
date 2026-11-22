"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { getOrigin, safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

const email = z.email("Enter a valid email address.");
const password = z.string().min(8, "Password must be at least 8 characters.");

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form.";
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email, password: z.string().min(1, "Enter your password.") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, firstError(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return failure(formData, error.message);

  redirect(safeNextPath(formData.get("next")));
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      full_name: z.string().trim().min(1, "Enter your name."),
      email,
      password,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, firstError(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${await getOrigin()}/auth/callback?next=/`,
    },
  });
  if (error) return failure(formData, error.message);

  if (data.session) redirect("/");
  return { message: "Check your email for a link to confirm your account." };
}

export async function requestPasswordReset(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z.object({ email }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, firstError(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error) return failure(formData, error.message);

  return { message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match." })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, firstError(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failure(formData, error.message);

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  try {
    const store = await cookies();
    const endpoint = store.get("fitcoach-push-endpoint")?.value;
    try {
      if (endpoint) {
        const { data } = await supabase.auth.getClaims();
        const userId = data?.claims?.sub;
        if (typeof userId === "string") await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
      }
    } finally { store.delete("fitcoach-push-endpoint"); }
  } catch { console.error("Push logout cleanup failed"); }
  const { error } = await supabase.auth.signOut();
  if (error) {
    // Revoking on the server failed (e.g. network); still clear this browser's session.
    const store = await cookies();
    for (const c of store.getAll()) if (c.name.startsWith("sb-")) store.delete(c.name);
  }
  redirect("/login");
}
