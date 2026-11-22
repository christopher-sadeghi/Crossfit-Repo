import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { programDate } from "@/lib/program-dates";
import type { Database } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";

type Client = SupabaseClient<Database>;
export type NotificationKind = "result_logged" | "workout_adjusted" | "low_readiness" | "message" | "missed_workouts" | "coach_message" | "schedule_changed" | "suggestion_approved" | "progress_report";
export type NotificationInput = {
  athleteId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
};

export async function notify(supabase: Client, input: NotificationInput): Promise<void> {
  try {
    if (["result_logged", "workout_adjusted", "low_readiness", "message"].includes(input.kind)) {
      const { data: athlete } = await supabase.from("athletes").select("first_name, last_name").eq("id", input.athleteId).maybeSingle();
      const name = athlete ? `${athlete.first_name} ${athlete.last_name}` : "An athlete";
      const body = input.body?.replace(/Your athlete|your athlete/g, name);
      input = { ...input, title: `${name}: ${input.title}`, body: body && !body.includes(name) ? `${name}: ${body}` : body };
    }
    const { error } = await supabase.rpc("create_notification", {
      p_athlete_id: input.athleteId,
      p_kind: input.kind,
      p_title: input.title,
      p_body: input.body ?? null,
      p_link: input.link ?? null,
      p_dedupe_key: input.dedupeKey ?? null,
    });
    if (error) console.error("Notification failed:", error);
  } catch (error) {
    console.error("Notification failed:", error);
  }
}

export function notifyResultLogged(supabase: Client, athleteId: string, resultId: string) {
  return notify(supabase, { athleteId, kind: "result_logged", title: "New workout result", body: "Your athlete logged a workout result.", link: `/athletes/${athleteId}?tab=workouts`, dedupeKey: `result:${resultId}` });
}

export function notifyWorkoutAdjusted(supabase: Client, athleteId: string, suggestionId: string, options?: { applied: boolean; checkWithCoach: boolean }) {
  return notify(supabase, { athleteId, kind: "workout_adjusted", title: options?.checkWithCoach ? "Pain reported — check with athlete" : "Workout adjusted with AI", body: options?.checkWithCoach ? `Your athlete reported pain while asking for an AI adjustment. ${options.applied ? "The WOD was adjusted." : "No adjustment was applied."} Please follow up.` : "Your athlete adjusted today's WOD with AI.", link: `/suggestions/${suggestionId}`, dedupeKey: `adjustment:${suggestionId}` });
}

export function notifyLowReadiness(supabase: Client, athleteId: string, entryOn: string) {
  return notify(supabase, { athleteId, kind: "low_readiness", title: "Low readiness check-in", body: "Your athlete may need a lighter training day. Review their latest check-in.", link: `/athletes/${athleteId}?tab=check-ins`, dedupeKey: `readiness:${athleteId}:${entryOn}` });
}

export function notifyMessage(supabase: Client, athleteId: string, messageId: string, sender: "coach" | "athlete") {
  return notify(supabase, { athleteId, kind: sender === "coach" ? "coach_message" : "message", title: sender === "coach" ? "New message from your coach" : "New athlete message", body: "You have a new message.", link: sender === "coach" ? "/athlete/messages" : `/messages/${athleteId}`, dedupeKey: `message:${messageId}` });
}

export function notifyScheduleChanged(supabase: Client, athleteId: string, change?: string | { action: "updated" | "removed" | "restored" | "moved" | "added"; date?: string }) {
  const details = typeof change === "object" ? change : null;
  return notify(supabase, { athleteId, kind: "schedule_changed", title: "Training schedule updated", body: details ? `Your coach ${details.action} a WOD${details.date ? ` on ${details.date}` : " in your schedule"}. Take a look at your workouts.` : "Your coach changed your training schedule. Take a look at your upcoming workouts.", link: "/athlete", dedupeKey: typeof change === "string" ? `schedule:${athleteId}:${change}` : undefined });
}

export async function notifySuggestionApproved(supabase: Client, athleteId: string, suggestionId: string): Promise<void> {
  try {
    const { data: suggestion, error } = await supabase.from("ai_suggestions").select("suggestion_type, athlete_id, coach_id, status, final").eq("id", suggestionId).eq("athlete_id", athleteId).maybeSingle();
    if (error) throw error;
    if (!suggestion || !["approved", "edited"].includes(suggestion.status)) return;
    if (suggestion.suggestion_type === "progress_summary") {
      const final = suggestion.final;
      if (!final || typeof final !== "object" || Array.isArray(final) || typeof final.summary !== "string" || !final.summary.trim() || final.summary.length > 2000) throw new Error("Progress summary text is unavailable.");
      const { error: messageError } = await supabase.from("messages").insert({ id: suggestionId, athlete_id: athleteId, coach_id: suggestion.coach_id, body: final.summary });
      if (messageError) {
        if (messageError.code !== "23505") throw messageError;
        const { data: existing, error: existingError } = await supabase.from("messages").select("id").eq("id", suggestionId).eq("athlete_id", athleteId).eq("sender_id", suggestion.coach_id).maybeSingle();
        if (existingError || !existing) throw existingError ?? messageError;
      }
      await notifyProgressReport(supabase, athleteId, suggestionId);
      return;
    }
    const isNutrition = suggestion.suggestion_type === "adjust_macros" || suggestion.suggestion_type === "suggest_food";
    await notify(supabase, { athleteId, kind: "suggestion_approved", title: "Coach approved an update", body: isNutrition ? "Your coach approved a nutrition update for you." : "Your coach approved a workout update for you.", link: isNutrition ? "/athlete/nutrition" : "/athlete", dedupeKey: `approved:${suggestionId}` });
  } catch (error) {
    console.error("Approval notification failed:", error);
  }
}

export function notifyProgressReport(supabase: Client, athleteId: string, reportId: string) {
  return notify(supabase, { athleteId, kind: "progress_report", title: "Progress report from your coach", body: "Your coach shared a new progress report. Open your messages to read it.", link: "/athlete/messages", dedupeKey: `report:${reportId}` });
}

export async function checkMissedWorkouts(supabase: Client, coach: { id: string }): Promise<void> {
  try {
    const today = await getToday();
    const range = { from: programDate(today, 1, -89), to: programDate(today, 1, 0) };
    const { data: athletes, error } = await supabase.from("athletes")
      .select("id, first_name, last_name").eq("coach_id", coach.id).eq("status", "active").not("user_id", "is", null);
    if (error) throw error;
    if (!athletes?.length) return;
    const schedules = await Promise.all(athletes.map(async (athlete) => ({
      athlete,
      items: (await loadAthleteSchedule(supabase, athlete.id, range, "id, source_workout_id, title, week_number, day_number"))
        .filter((item) => !item.removed && item.date < today).slice(-3),
    })));
    const workoutIds = [...new Set(schedules.flatMap(({ items }) => items.flatMap(({ workout }) =>
      workout.source_workout_id ? [workout.id, workout.source_workout_id] : [workout.id])))];
    if (!workoutIds.length) return;
    const { data: results, error: resultError } = await supabase.from("workout_results")
      .select("athlete_id, workout_id, performed_on").in("athlete_id", athletes.map(({ id }) => id)).in("workout_id", workoutIds);
    if (resultError) throw resultError;
    const completed = new Map<string, string[]>();
    for (const result of results ?? []) {
      const key = `${result.athlete_id}:${result.workout_id}`;
      completed.set(key, [...(completed.get(key) ?? []), result.performed_on]);
    }
    await Promise.all(schedules.map(async ({ athlete, items }) => {
      if (items.length !== 3 || items.some(({ workout, date }) => {
        return [workout.id, workout.source_workout_id].some((id) => id &&
          completed.get(`${athlete.id}:${id}`)?.some((performedOn) => performedOn >= date));
      })) return;
      await notify(supabase, {
        athleteId: athlete.id, kind: "missed_workouts", title: `${athlete.first_name} ${athlete.last_name}: Three scheduled WODs missed`,
        body: `${athlete.first_name} ${athlete.last_name} has no results for their last three scheduled workouts.`,
        link: `/athletes/${athlete.id}`, dedupeKey: `missed:${athlete.id}:${items[2].date}`,
      });
    }));
  } catch (error) {
    console.error("Missed workout check failed:", error);
  }
}
