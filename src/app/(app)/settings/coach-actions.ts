"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { coachInviteEmail } from "@/lib/email/builders";
import { sendEmail } from "@/lib/email/config";
import { siteOrigin } from "@/lib/email/origin";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export type CoachInviteState = { error?: string; message?: string; link?: string };

const emailSchema = z.string().trim().email("Enter a valid email address.").max(254);

export async function createCoachInvite(_: CoachInviteState, formData: FormData): Promise<CoachInviteState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || viewer.role !== "owner") {
    return { error: "Only the gym owner can invite coaches." };
  }
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  const email = parsed.data.toLowerCase();
  const supabase = await createClient();
  const { data: invite, error } = await supabase.from("coach_invites")
    .insert({ gym_id: viewer.gymId, email, invited_by: viewer.id })
    .select("id, token")
    .single();
  if (error || !invite) {
    return { error: error?.code === "23505" ? "An active invite already exists for this email." : "Couldn't create the coach invite." };
  }

  const origin = siteOrigin();
  const link = `${origin}/join-coach/${invite.token}`;
  const content = coachInviteEmail({ coachName: viewer.fullName, gymName: viewer.gymName, link, origin });
  const result = await sendEmail({ to: email, ...content });
  revalidatePath("/settings");
  return {
    link,
    message: result.sent
      ? `Invite emailed to ${email}.`
      : `Invite ready for ${email}. We couldn't email it, so copy the link below.`,
  };
}

export async function revokeCoachInvite(id: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || viewer.role !== "owner") return { error: "Only the gym owner can revoke invites." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("coach_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("gym_id", viewer.gymId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't revoke this invite." };
  revalidatePath("/settings");
  return {};
}

export async function removeGymCoach(coachId: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || viewer.role !== "owner") return { error: "Only the gym owner can remove coaches." };
  if (coachId === viewer.gymId) return { error: "The gym owner cannot remove themselves." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_gym_coach", { p_coach_id: coachId });
  if (error) return { error: "Couldn't remove this coach." };
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return {};
}
