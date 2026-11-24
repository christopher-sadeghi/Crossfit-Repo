import { z } from "zod";
import { SECTION_FORMATS } from "../workout-sections";

export const programMovementSchema = z.object({
  movement_id: z.string(),
  sets: z.number().int().min(1).max(100).nullable(),
  reps: z.number().int().min(1).max(1000).nullable(),
  load: z.number().min(0).max(2000).nullable(),
  distance_m: z.number().positive().max(100000).nullable(),
  calories: z.number().int().positive().max(1000).nullable(),
  duration_seconds: z.number().int().positive().max(7200).nullable(),
  notes: z.string().max(500).nullable(),
  section: z.number().int().min(0).max(9).nullable(),
});
const programSectionSchema = z.object({
  title: z.string().trim().min(1).max(80),
  format: z.enum(SECTION_FORMATS),
  time_cap_minutes: z.number().int().min(1).max(180).nullable(),
  rounds: z.number().int().min(1).max(100).nullable(),
});
export const programWorkoutSchema = z.object({
  day_number: z.number().int().min(1).max(7),
  title: z.string().trim().min(1).max(80),
  workout_type: z.enum(["for_time", "amrap", "emom", "strength", "other"]),
  time_cap_minutes: z.number().int().positive().max(300).nullable(),
  rounds: z.number().int().positive().max(100).nullable(),
  description: z.string().max(3000).nullable(),
  notes: z.string().max(2000).nullable(),
  sections: z.array(programSectionSchema).max(10),
  movements: z.array(programMovementSchema).min(1).max(15),
});
export const programWeekSchema = z.object({ week_number: z.number().int().min(1).max(4), workouts: z.array(programWorkoutSchema).min(1).max(7) });
export const draftProgramSchema = z.object({
  name: z.string().trim().min(1).max(80), rationale: z.string().trim().min(1).max(1000),
  start_date: z.string().date(), weeks: z.array(programWeekSchema).length(4),
});
export const draftProgramInputSchema = z.object({
  units: z.enum(["lb", "kg"]), days_per_week: z.number().int().min(1).max(7),
  library: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type DraftProgram = z.infer<typeof draftProgramSchema>;

export function validateDraftProgram(proposal: unknown, input: unknown) {
  const program = draftProgramSchema.parse(proposal);
  const context = draftProgramInputSchema.parse(input);
  const allowed = new Set(context.library.map((m) => m.id));
  if (new Set(program.weeks.map((w) => w.week_number)).size !== 4) throw new Error("Duplicate week number.");
  for (const week of program.weeks) {
    if (week.workouts.length !== context.days_per_week) throw new Error("Each week must match the intake training days.");
    if (new Set(week.workouts.map((w) => w.day_number)).size !== week.workouts.length) throw new Error("Duplicate day number in week.");
    if (week.workouts.some((w) => w.movements.some((m) => !allowed.has(m.movement_id)))) throw new Error("Unknown movement id.");
  }
}
