"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { siteOrigin } from "@/lib/email/origin";
import { createClient } from "@/lib/supabase/server";

const INVALID_INVITE = "This coach invitation is no longer valid. Ask the gym owner for a new link.";
const joinForm = z.object({
  invite_token: z.string().uuid(INVALID_INVITE),
  full_name: z.string().trim().min(1, "Enter your name.").max(100),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function joinCoach(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = joinForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.sub) return failure(formData, "Log out before creating your invited coach account.");

  const { data: invites, error: inviteError } = await supabase.rpc("get_coach_invite", {
    p_token: parsed.data.invite_token,
  });
  const invite = invites?.[0];
  if (inviteError || !invite?.usable || !invite.email) return failure(formData, INVALID_INVITE);

  const { data, error } = await supabase.auth.signUp({
    email: invite.email,
    password: parsed.data.password,
    options: {
      data: {
        role: "coach_invite",
        invite_token: parsed.data.invite_token,
        full_name: parsed.data.full_name,
      },
      emailRedirectTo: `${siteOrigin()}/auth/callback?next=/`,
    },
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (error.code === "user_already_exists" || message.includes("already registered")) {
      return failure(formData, "This email already has an account. Coach invitations create new accounts and cannot be merged.");
    }
    if (message.includes("invalid_invite") || message.includes("database error")) {
      return failure(formData, INVALID_INVITE);
    }
    return failure(formData, error.message);
  }
  if (data.session) redirect("/");
  return { message: "Check your email to confirm your new coach account, then log in." };
}
