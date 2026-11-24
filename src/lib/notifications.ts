import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { loadDriftingAthletes } from "@/lib/consistency-data";
import { programDate } from "@/lib/program-dates";
import type { Database } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";

type Client = SupabaseClient<Database>;
export type NotificationKind = "result_logged" | "workout_adjusted" | "low_readiness" | "message" | "missed_workouts" | "coach_message" | "schedule_changed" | "suggestion_approved" | "progress_report" | "progress_check_in" | "high_training_load" | "form_check" | "form_reviewed" | "assistant_red_flag" | "check_in_reminder" | "payment_failed" | "health_flag" | "athlete_profile_changed";
export type NotificationInput = {
  athleteId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
};

export function dispatchNewNotifications(athleteId: string, kind: NotificationKind): void {
  try {
    after(async () => {
      await Promise.all([
        (async () => {
          try {
            const { pushNewNotifications } = await import("@/lib/push/send");
            await pushNewNotifications({ athleteId, kind });
          } catch { console.error("Push scheduling failed"); }
        })(),
        (async () => {
          try {
            const { emailNewNotifications } = await import("@/lib/email/notifications");
            await emailNewNotifications({ athleteId, kind });
          } catch { console.error("Email scheduling failed"); }
        })(),
      ]);
    });
  } catch { /* Outside a request, notification creation still succeeds. */ }
}

export async function notify(supabase: Client, input: NotificationInput): Promise<void> {
  try {
    if (["result_logged", "workout_adjusted", "low_readiness", "message", "form_check"].includes(input.kind)) {
      const { data: athlete } = await supabase.from("athletes").select("first_name, last_name").eq("id", input.athleteId).maybeSingle();
      const name = athlete ? `${athlete.first_name} ${athlete.last_name}` : "An athlete";
      const body = input.body?.replace(/Your athlete|your athlete/g, name);
      input = { ...input, title: `${name}: ${input.title}`, body: body && !body.includes(name) ? `${name}: ${body}` : body };
    }
    const { error } = await supabase.rpc("create_notification", {
      p_athlete_id: input.athleteId,
      p_kind: input.kind,
      p_title: input.title,
      p_body: input.body,
      p_link: input.link,
      p_dedupe_key: input.dedupeKey,
    });
    if (error) console.error("Notification failed:", error);
    else dispatchNewNotifications(input.athleteId, input.kind);
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
    if (suggestion.suggestion_type === "weekly_report") {
      await notifyProgressReport(supabase, athleteId, suggestionId);
      return;
    }
    if (suggestion.suggestion_type === "progress_summary") {
      const final = suggestion.final;
      if (!final || typeof final !== "object" || Array.isArray(final) || typeof final.summary !== "string" || !final.summary.trim() || final.summary.length > 2000) throw new Error("Progress summary text is unavailable.");
      const { error: messageError } = await supabase.from("messages").insert({ id: suggestionId, athlete_id: athleteId, coach_id: suggestion.coach_id, body: final.summary });
      if (messageError) {
        if (messageError.code !== "23505") throw messageError;
        const { data: existing, error: existingError } = await supabase.from("messages").select("id").eq("id", suggestionId).eq("athlete_id", athleteId).eq("sender_id", suggestion.coach_id).maybeSingle();
        if (existingError || !existing) throw existingError ?? messageError;
      }
      await notifyProgressReport(supabase, athleteId, suggestionId, "messages");
      return;
    }
    const isNutrition = suggestion.suggestion_type === "adjust_macros" || suggestion.suggestion_type === "suggest_food";
    await notify(supabase, { athleteId, kind: "suggestion_approved", title: "Coach approved an update", body: isNutrition ? "Your coach approved a nutrition update for you." : "Your coach approved a workout update for you.", link: isNutrition ? "/athlete/nutrition" : "/athlete", dedupeKey: `approved:${suggestionId}` });
  } catch (error) {
    console.error("Approval notification failed:", error);
  }
}

export function notifyProgressReport(supabase: Client, athleteId: string, reportId: string, destination: "reports" | "messages" = "reports") {
  const weekly = destination === "reports";
  return notify(supabase, {
    athleteId,
    kind: "progress_report",
    title: weekly ? "Weekly report from your coach" : "Progress report from your coach",
    body: weekly ? "Your coach shared your weekly progress report." : "Your coach shared a new progress report. Open your messages to read it.",
    link: weekly ? `/athlete/reports?report=${reportId}#report-${reportId}` : "/athlete/messages",
    dedupeKey: `report:${reportId}`,
  });
}

export async function checkDriftingAthletes(
  supabase: Client,
  coach: { id: string; gymId?: string; driftDays?: number },
  snapshot?: { today: string; athletes: Awaited<ReturnType<typeof loadDriftingAthletes>> },
): Promise<void> {
  try {
    const today = snapshot?.today ?? await getToday();
    const athletes = snapshot?.athletes ?? await loadDriftingAthletes(supabase, coach.gymId ?? coach.id, today, coach.driftDays);
    await Promise.all(athletes.flatMap(({ athlete, stats, reasons, daysSinceActivity, last30Rate, prev30Rate }) =>
      reasons.map((reason) => {
        const detail = reason === "inactive"
          ? daysSinceActivity === null ? "no activity recorded" : `no activity in ${daysSinceActivity} days`
          : `completion down from ${prev30Rate}% to ${last30Rate ?? 0}%`;
        const episode = reason === "inactive" ? stats.lastActivityDate ?? "never" : today.slice(0, 7);
        return notify(supabase, {
          athleteId: athlete.id,
          kind: "missed_workouts",
          title: `${athlete.first_name} ${athlete.last_name}: drifting — ${detail}`,
          link: `/athletes/${athlete.id}?tab=consistency`,
          dedupeKey: `drifting:${reason}:${athlete.id}:${episode}`,
        });
      }),
    ));
  } catch (error) {
    console.error("Drifting-athlete check failed:", error);
  }
}

export async function checkProgressReminders(supabase: Client, scope: { coachId: string } | { athleteId: string }): Promise<void> {
  try {
    const today = await getToday();
    const query = supabase.from("progress_reminders").select(`athlete_id, starts_on, cadence_weeks,
      athlete:athletes!progress_reminders_athlete_id_fkey!inner(
        status, user_id,
        measurements:body_measurements!body_measurements_athlete_id_fkey(measured_on),
        photos:progress_photos!progress_photos_athlete_id_fkey(taken_on)
      )`)
      .eq("athlete.status", "active").not("athlete.user_id", "is", null)
      .lte("athlete.measurements.measured_on", today).lte("athlete.photos.taken_on", today)
      .order("measured_on", { referencedTable: "athlete.measurements", ascending: false }).limit(1, { referencedTable: "athlete.measurements" })
      .order("taken_on", { referencedTable: "athlete.photos", ascending: false }).limit(1, { referencedTable: "athlete.photos" });
    const { data, error } = await ("coachId" in scope ? query.eq("coach_id", scope.coachId) : query.eq("athlete_id", scope.athleteId));
    if (error) throw error;
    await Promise.all((data ?? []).map((reminder) => {
      const latest = [reminder.starts_on, reminder.athlete.measurements[0]?.measured_on, reminder.athlete.photos[0]?.taken_on]
        .filter((date): date is string => !!date).sort().at(-1)!;
      const dueDate = programDate(latest, reminder.cadence_weeks + 1, 1);
      if (today < dueDate) return;
      return notify(supabase, {
        athleteId: reminder.athlete_id, kind: "progress_check_in", title: "Time for a progress check-in",
        body: "Capture your progress with photos and measurements when you're ready.", link: "/athlete/progress",
        dedupeKey: `progress-check-in:${reminder.athlete_id}:${dueDate}`,
      });
    }));
  } catch (error) {
    console.error("Progress reminder check failed:", error);
  }
}

export async function checkMissedWorkouts(supabase: Client, coach: { id: string; gymId: string }): Promise<void> {
  try {
    const today = await getToday();
    const range = { from: programDate(today, 1, -89), to: programDate(today, 1, 0) };
    const { data: athletes, error } = await supabase.from("athletes")
      .select("id, first_name, last_name").eq("coach_id", coach.gymId).eq("status", "active").not("user_id", "is", null);
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
