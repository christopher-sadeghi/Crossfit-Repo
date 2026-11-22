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
  assignmentStartDate?: string;
  removed?: boolean;
  overrides?: { workoutId: string; programId: string; programName: string; source: "group" | "personal" };
};

type ScheduleRange = { from: string; to: string };
type ProgramWorkout<TWorkout> = TWorkout & { program_id: string | null };
type OneOffWorkout<TWorkout> = TWorkout & { scheduled_on: string | null };

export async function loadAthleteSchedule<TWorkout extends ScheduleWorkout>(
  supabase: SupabaseClient<Database>,
  athleteId: string,
  range: ScheduleRange,
  workoutSelect: string,
  options: { includeRemoved?: boolean } = {},
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
  const [{ data: programRows }, { data: oneOffRows }, { data: overrides, error: overrideError }] = await Promise.all([
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
    supabase.from("athlete_workout_overrides").select("workout_id, replacement_workout_id").eq("athlete_id", athleteId),
  ]);
  if (overrideError) throw new Error("Couldn't load athlete schedule overrides.");
  const overrideByWorkout = new Map((overrides ?? []).map((row) => [row.workout_id, row]));
  const replacementSources = new Map<string, NonNullable<AthleteScheduleItem["overrides"]>>();

  const items: AthleteScheduleItem<TWorkout>[] = [];
  for (const workout of (programRows ?? []) as unknown as ProgramWorkout<TWorkout>[]) {
    if (!workout.program_id || workout.week_number == null || workout.day_number == null) continue;
    const assignment = assignmentByProgram.get(workout.program_id);
    if (!assignment) continue;
    const override = overrideByWorkout.get(workout.id);
    if (override?.replacement_workout_id) {
      replacementSources.set(override.replacement_workout_id, {
        workoutId: workout.id, programId: assignment.program.id, programName: assignment.program.name,
        source: assignment.program.athlete_id ? "personal" : "group",
      });
    }
    if (override && (!options.includeRemoved || override.replacement_workout_id)) continue;

    const date = programDate(assignment.startDate, workout.week_number, workout.day_number);
    if (date < range.from || date > range.to) continue;
    items.push({
      workout,
      date,
      source: assignment.program.athlete_id ? "personal" : "group",
      programId: assignment.program.id,
      programName: assignment.program.name,
      assignmentStartDate: assignment.startDate,
      ...(override ? { removed: true } : {}),
    });
  }

  for (const workout of (oneOffRows ?? []) as unknown as OneOffWorkout<TWorkout>[]) {
    if (!workout.scheduled_on) continue;
    items.push({
      workout,
      date: workout.scheduled_on,
      source: "one_off",
      programId: null,
      programName: null,
      overrides: replacementSources.get(workout.id),
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.workout.title.localeCompare(b.workout.title));
}

export function SCHEDULE_LABEL(item: Pick<AthleteScheduleItem, "source" | "programName">, audience: "coach" | "athlete" = "coach") {
  if (item.source === "one_off") return audience === "athlete" ? "Just for you" : "Just this athlete";
  return `${item.source === "group" ? "Group" : "Personal"} · ${item.programName ?? ""}`;
}
