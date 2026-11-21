import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { programDate } from "./program-dates";

type ScheduleWorkout = {
  id: string;
  source_workout_id: string | null;
  title: string;
  week_number: number | null;
  day_number: number | null;
};

export type AthleteScheduleItem<TWorkout extends ScheduleWorkout = ScheduleWorkout> = {
  workout: TWorkout;
  date: string;
  source: "group" | "personal" | "one_off";
  programId: string | null;
  programName: string | null;
};

type ScheduleRange = { from: string; to: string };
type ProgramWorkout<TWorkout> = TWorkout & { program_id: string | null };
type OneOffWorkout<TWorkout> = TWorkout & { scheduled_on: string | null };

export async function loadAthleteSchedule<TWorkout extends ScheduleWorkout>(
  supabase: SupabaseClient<Database>,
  athleteId: string,
  range: ScheduleRange,
  workoutSelect: string,
): Promise<AthleteScheduleItem<TWorkout>[]> {
  const { data: assignmentRows } = await supabase
    .from("program_assignments")
    .select("start_date, programs(id, name, athlete_id)")
    .eq("athlete_id", athleteId);

  const assignments = assignmentRows ?? [];
  const assignmentByProgram = new Map<
    string,
    { startDate: string; program: { id: string; name: string; athlete_id: string | null } }
  >();
  for (const assignment of assignments) {
    if (assignment.programs) {
      assignmentByProgram.set(assignment.programs.id, {
        startDate: assignment.start_date,
        program: assignment.programs,
      });
    }
  }

  const programIds = [...assignmentByProgram.keys()];
  const [{ data: programRows }, { data: oneOffRows }] = await Promise.all([
    programIds.length
      ? supabase.from("workouts").select(`program_id,${workoutSelect}`).in("program_id", programIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("workouts")
      .select(`scheduled_on,${workoutSelect}`)
      .eq("athlete_id", athleteId)
      .is("program_id", null)
      .gte("scheduled_on", range.from)
      .lte("scheduled_on", range.to),
  ]);

  const items: AthleteScheduleItem<TWorkout>[] = [];
  for (const workout of (programRows ?? []) as unknown as ProgramWorkout<TWorkout>[]) {
    if (!workout.program_id || workout.week_number == null || workout.day_number == null) continue;
    const assignment = assignmentByProgram.get(workout.program_id);
    if (!assignment) continue;

    const date = programDate(assignment.startDate, workout.week_number, workout.day_number);
    if (date < range.from || date > range.to) continue;
    items.push({
      workout,
      date,
      source: assignment.program.athlete_id ? "personal" : "group",
      programId: assignment.program.id,
      programName: assignment.program.name,
    });
  }

  const oneOffs = (oneOffRows ?? []) as unknown as OneOffWorkout<TWorkout>[];
  const scaledKeys = new Set(
    oneOffs.filter((w) => w.source_workout_id && w.scheduled_on).map((w) => `${w.source_workout_id}|${w.scheduled_on}`),
  );
  const visibleItems = items.filter((item) => !scaledKeys.has(`${item.workout.id}|${item.date}`));
  items.length = 0;
  items.push(...visibleItems);

  for (const workout of oneOffs) {
    if (!workout.scheduled_on) continue;
    items.push({
      workout,
      date: workout.scheduled_on,
      source: "one_off",
      programId: null,
      programName: null,
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.workout.title.localeCompare(b.workout.title));
}

export function SCHEDULE_LABEL(item: Pick<AthleteScheduleItem, "source" | "programName" | "workout">) {
  if (item.source === "one_off") return item.workout.source_workout_id ? "Scaled for you" : "One-off";
  return `${item.source === "group" ? "Group" : "Personal"} · ${item.programName ?? ""}`;
}
