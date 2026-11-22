import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { programDate } from "@/lib/program-dates";
import type { Database } from "@/lib/supabase/database.types";
import type { AthleteViewer, CoachViewer } from "@/lib/viewer";

type Client = SupabaseClient<Database>;
export type MessageLink = { type: "workout" | "result" | "suggestion"; id: string };
export type LinkOption = MessageLink & { label: string; href: string };

export function parseMessageLink(value: string): MessageLink | null {
  const [type, id, extra] = value.split(":");
  if (extra !== undefined || !["workout", "result", "suggestion"].includes(type) || !z.string().uuid().safeParse(id).success) return null;
  return { type: type as MessageLink["type"], id };
}

export async function messageAthlete(supabase: Client, viewer: CoachViewer | AthleteViewer, athleteId: string) {
  if (!z.string().uuid().safeParse(athleteId).success || (viewer.kind === "athlete" && viewer.athleteId !== athleteId)) return null;
  const { data, error } = await supabase.from("athletes").select("id, coach_id, user_id, first_name, last_name, status")
    .eq("id", athleteId).eq("status", "active").maybeSingle();
  if (error) throw new Error("Couldn't load this athlete.");
  if (!data || (viewer.kind === "coach" && data.coach_id !== viewer.id)) return null;
  return data;
}

export async function validateMessageLink(supabase: Client, athleteId: string, link: MessageLink, isCoach: boolean): Promise<boolean> {
  if (link.type === "suggestion") {
    if (!isCoach) return false;
    const { data, error } = await supabase.from("ai_suggestions").select("id").eq("id", link.id).eq("athlete_id", athleteId).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  if (link.type === "result") {
    const { data, error } = await supabase.from("workout_results").select("id").eq("id", link.id).eq("athlete_id", athleteId).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  const { data: workout, error } = await supabase.from("workouts").select("id, athlete_id, program_id").eq("id", link.id).maybeSingle();
  if (error) throw error;
  if (!workout) return false;
  if (workout.athlete_id === athleteId) return true;
  if (workout.athlete_id || !workout.program_id) return false;
  const [{ data: assignment, error: assignmentError }, { data: override, error: overrideError }] = await Promise.all([
    supabase.from("program_assignments").select("id").eq("program_id", workout.program_id).eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_workout_overrides").select("id").eq("workout_id", workout.id).eq("athlete_id", athleteId).maybeSingle(),
  ]);
  if (assignmentError || overrideError) throw assignmentError ?? overrideError;
  return Boolean(assignment && !override);
}

export async function resolveMessageLinks(supabase: Client, athleteId: string, links: MessageLink[], isCoach: boolean): Promise<Map<string, LinkOption>> {
  const ids = (type: MessageLink["type"]) => [...new Set(links.filter((link) => link.type === type).map((link) => link.id))];
  const workoutIds = ids("workout"), resultIds = ids("result"), suggestionIds = ids("suggestion");
  const [workouts, results, suggestions] = await Promise.all([
    workoutIds.length ? supabase.from("workouts").select("id, title").in("id", workoutIds) : { data: [], error: null },
    resultIds.length ? supabase.from("workout_results").select("id, performed_on, workouts(title)").eq("athlete_id", athleteId).in("id", resultIds) : { data: [], error: null },
    isCoach && suggestionIds.length ? supabase.from("ai_suggestions").select("id, suggestion_type").eq("athlete_id", athleteId).in("id", suggestionIds) : { data: [], error: null },
  ]);
  const resolved = new Map<string, LinkOption>();
  for (const row of workouts.data ?? []) resolved.set(`workout:${row.id}`, { type: "workout", id: row.id, label: row.title, href: isCoach ? `/programs/workouts/${row.id}` : `/athlete/log/${row.id}` });
  for (const row of results.data ?? []) resolved.set(`result:${row.id}`, { type: "result", id: row.id, label: `${row.workouts?.title ?? "Workout result"} · ${row.performed_on}`, href: isCoach ? `/athletes/${athleteId}?tab=workouts` : "/athlete/history" });
  for (const row of suggestions.data ?? []) resolved.set(`suggestion:${row.id}`, { type: "suggestion", id: row.id, label: row.suggestion_type.replaceAll("_", " "), href: `/suggestions/${row.id}` });
  return resolved;
}

export async function messageLinkOptions(supabase: Client, athleteId: string, today: string, isCoach: boolean): Promise<LinkOption[]> {
  const [schedule, results, suggestions] = await Promise.all([
    loadAthleteSchedule(supabase, athleteId, { from: programDate(today, 1, -13), to: programDate(today, 1, 8) }, "id, source_workout_id, title, week_number, day_number"),
    supabase.from("workout_results").select("id").eq("athlete_id", athleteId).order("created_at", { ascending: false }).limit(20),
    isCoach ? supabase.from("ai_suggestions").select("id").eq("athlete_id", athleteId).order("created_at", { ascending: false }).limit(20) : { data: [], error: null },
  ]);
  if (results.error || suggestions.error) throw new Error("Couldn't load message links.");
  const links: MessageLink[] = [
    ...schedule.filter((item) => !item.removed).map(({ workout }) => ({ type: "workout" as const, id: workout.id })),
    ...(results.data ?? []).map(({ id }) => ({ type: "result" as const, id })),
    ...(suggestions.data ?? []).map(({ id }) => ({ type: "suggestion" as const, id })),
  ];
  return [...(await resolveMessageLinks(supabase, athleteId, links, isCoach)).values()].map((option) =>
    option.type === "suggestion" ? { ...option, label: `${option.label} (only you can open this)` } : option);
}
