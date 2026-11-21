"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";

import { LEVELS, SEXES } from "./options";

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable());

const athleteSchema = z.object({
  first_name: z.string().trim().min(1, "Enter a first name.").max(50),
  last_name: z.string().trim().min(1, "Enter a last name.").max(50),
  email: optional(z.string().trim().email("Enter a valid email.")),
  birth_date: optional(
    z.string().date("Enter a valid birth date.").refine((d) => new Date(d) < new Date(), "Birth date must be in the past."),
  ),
  sex: optional(z.enum(SEXES)),
  height_cm: optional(z.coerce.number().min(100, "Height must be 100–250 cm.").max(250, "Height must be 100–250 cm.")),
  experience_level: z.enum(LEVELS, { message: "Choose an experience level." }),
  injuries: optional(z.string().trim().max(500)),
  notes: optional(z.string().trim().max(2000)),
});

export async function saveAthlete(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = athleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  }

  const id = formData.get("id");
  const supabase = await createClient();
  const query =
    typeof id === "string" && id
      ? supabase.from("athletes").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", id)
      : supabase.from("athletes").insert(parsed.data);
  const { data, error } = await query.select("id").single();
  if (error) return failure(formData, "Couldn't save the athlete. Please try again.");

  revalidatePath("/athletes");
  redirect(`/athletes/${data.id}`);
}

export async function setAthleteStatus(id: string, status: "active" | "archived") {
  const supabase = await createClient();
  const { error } = await supabase
    .from("athletes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("Couldn't update the athlete.");

  revalidatePath("/athletes");
  revalidatePath(`/athletes/${id}`);
}

const athleteIdSchema = z.string().uuid();

function parseAthleteId(formData: FormData) {
  return athleteIdSchema.safeParse(formData.get("athlete_id"));
}

export async function createAthleteInvite(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseAthleteId(formData);
  if (!parsed.success) return failure(formData, "Couldn't create the invite. Please try again.");

  const supabase = await createClient();
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("email, user_id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (athleteError || !athlete) {
    return failure(formData, "Couldn't find this athlete. Please refresh and try again.");
  }
  if (athlete.user_id) {
    return failure(formData, "This athlete already has app access.");
  }

  const email = athlete.email?.trim();
  if (!email) return failure(formData, "Add an email to the athlete profile before inviting them.");

  const { data: openInvite, error: openInviteError } = await supabase
    .from("athlete_invites")
    .select("id")
    .eq("athlete_id", parsed.data)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (openInviteError) {
    return failure(formData, "Couldn't create the invite. Please try again.");
  }

  if (openInvite) {
    const { data: revokedInvite, error } = await supabase
      .from("athlete_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", openInvite.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) return failure(formData, "Couldn't resend the invite. Please try again.");
    if (!revokedInvite) {
      return failure(formData, "This invite was just accepted. Refresh the page.");
    }
  }

  const { error } = await supabase
    .from("athlete_invites")
    .insert({ athlete_id: parsed.data, email })
    .select("id")
    .single();

  if (error) return failure(formData, "Couldn't create the invite. Please try again.");

  revalidatePath("/athletes");
  revalidatePath(`/athletes/${parsed.data}`);
  return { message: `Invite ready for ${email}.` };
}

export async function revokeAthleteInvite(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseAthleteId(formData);
  if (!parsed.success) return failure(formData, "Couldn't revoke the invite. Please try again.");

  const supabase = await createClient();
  const { data: invite, error: inviteError } = await supabase
    .from("athlete_invites")
    .select("id")
    .eq("athlete_id", parsed.data)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (inviteError || !invite) {
    return failure(formData, "This invite is no longer active.");
  }

  const { data: revokedInvite, error } = await supabase
    .from("athlete_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) return failure(formData, "Couldn't revoke the invite. Please try again.");
  if (!revokedInvite) {
    return failure(formData, "This athlete just joined. Use Revoke access instead.");
  }

  revalidatePath("/athletes");
  revalidatePath(`/athletes/${parsed.data}`);
  return { message: "Invite revoked." };
}

export async function revokeAthleteAccess(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseAthleteId(formData);
  if (!parsed.success) return failure(formData, "Couldn't revoke app access. Please try again.");

  const supabase = await createClient();
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("user_id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (athleteError || !athlete?.user_id) {
    return failure(formData, "This athlete does not have app access.");
  }

  const { error: inviteError } = await supabase
    .from("athlete_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("athlete_id", parsed.data)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (inviteError) {
    return failure(formData, "Couldn't revoke app access. Please try again.");
  }

  const { data: updated, error } = await supabase
    .from("athletes")
    .update({ user_id: null, updated_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .not("user_id", "is", null)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return failure(formData, "Couldn't revoke app access. Please try again.");
  }

  revalidatePath("/athletes");
  revalidatePath(`/athletes/${parsed.data}`);
  return { message: "App access revoked." };
}

const copyProgramSchema = z.object({
  program_id: z.string().uuid("Choose a group program."),
  athlete_id: z.string().uuid(),
  start_date: z.preprocess(
    (value) => (value == null || value === "" ? null : value),
    z.string().date("Choose a start date.").nullable(),
  ),
});

export async function copyProgramForAthlete(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = copyProgramSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");

  const supabase = await createClient();
  const { data: programId, error } = await supabase.rpc("copy_program_for_athlete", {
    p_program_id: parsed.data.program_id,
    p_athlete_id: parsed.data.athlete_id,
    p_start_date: parsed.data.start_date,
  });
  if (error || !programId) {
    if (error?.message.includes("start date")) {
      return failure(formData, "Choose a start date for this personal program.");
    }
    return failure(formData, "Couldn't make a personal copy. Check your selection and try again.");
  }

  revalidatePath("/programs");
  revalidatePath(`/athletes/${parsed.data.athlete_id}`);
  redirect(`/programs/${programId}`);
}
