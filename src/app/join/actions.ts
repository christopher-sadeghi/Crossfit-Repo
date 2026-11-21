"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { getOrigin } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

const INVALID_INVITE = "This invite link is no longer valid. Ask your coach for a new one.";

const inviteForm = z
  .object({
    invite_token: z.string().uuid(),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string().min(8, "Password must be at least 8 characters."),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form.";
}

export async function acceptInvite(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = inviteForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const invalidToken = parsed.error.issues.some(
      (issue) => issue.path[0] === "invite_token",
    );
    return failure(formData, invalidToken ? INVALID_INVITE : firstError(parsed.error));
  }

  const supabase = await createClient();
  const { data: invites, error: inviteError } = await supabase.rpc("get_invite", {
    p_token: parsed.data.invite_token,
  });
  const invite = invites?.[0];
  if (inviteError || !invite) return failure(formData, INVALID_INVITE);

  const { data, error } = await supabase.auth.signUp({
    email: invite.email,
    password: parsed.data.password,
    options: {
      data: {
        role: "athlete",
        invite_token: parsed.data.invite_token,
        full_name: invite.athlete_first_name,
      },
      emailRedirectTo: `${await getOrigin()}/auth/callback?next=/athlete`,
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (
      (error.status ?? 0) >= 500 ||
      message.includes("invalid_invite") ||
      message.includes("database error")
    ) {
      return failure(formData, INVALID_INVITE);
    }
    return failure(formData, error.message);
  }

  if (data.session) redirect("/athlete");
  return { message: "Check your email to confirm, then log in." };
}
