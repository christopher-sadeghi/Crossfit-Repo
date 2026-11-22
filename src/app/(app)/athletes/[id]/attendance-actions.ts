"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

const attendanceSchema = z.object({
  athlete_id: z.uuid(),
  attended_on: z.iso.date(),
  kind: z.enum(["class", "open_gym"]),
  note: z.string().trim().max(500, "Keep the note to 500 characters or fewer.").optional(),
});

function refresh(athleteId: string) {
  revalidatePath(`/athletes/${athleteId}`);
  revalidatePath("/attendance");
  revalidatePath("/athlete");
  revalidatePath("/athlete/history");
}

async function attendanceInput(data: FormData) {
  const parsed = attendanceSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." } as const;
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return { error: "Only coaches can manage attendance." } as const;
  if (parsed.data.attended_on > await getToday()) return { error: "Attendance cannot be in the future." } as const;
  const supabase = await createClient();
  const { data: athlete, error } = await supabase.from("athletes").select("id").eq("id", parsed.data.athlete_id).eq("coach_id", viewer.gymId).maybeSingle();
  if (error || !athlete) return { error: "This athlete is not available to you." } as const;
  return { input: parsed.data, supabase } as const;
}

export async function markAttendance(_: FormState, data: FormData): Promise<FormState> {
  const checked = await attendanceInput(data);
  if ("error" in checked) return failure(data, checked.error ?? "Please check the form.");
  const { input, supabase } = checked;
  const { error } = await supabase.from("attendance").insert({ ...input, note: input.note || null });
  if (error) return failure(data, error.code === "23505" ? "Attendance is already marked for this date and session type." : "Couldn't mark attendance. Please try again.");
  refresh(input.athlete_id);
  return { message: "Attendance marked." };
}

export async function removeAttendance(_: FormState, data: FormData): Promise<FormState> {
  const checked = await attendanceInput(data);
  if ("error" in checked) return failure(data, checked.error ?? "Please check the form.");
  const { input, supabase } = checked;
  const { error } = await supabase.from("attendance").delete().eq("athlete_id", input.athlete_id).eq("attended_on", input.attended_on).eq("kind", input.kind);
  if (error) return failure(data, "Couldn't remove attendance. Please try again.");
  refresh(input.athlete_id);
  return { message: "Attendance removed." };
}
