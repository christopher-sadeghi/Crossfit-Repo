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
