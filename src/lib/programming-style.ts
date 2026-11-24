import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

export const programmingStyleSchema = z.object({
  athlete_types: z.array(z.enum(["beginners", "general_fitness", "competitors", "older_adults", "weight_loss", "youth", "endurance"])).default([]),
  format: z.enum(["group", "one_on_one", "online"]).optional(),
  session_minutes: z.enum(["30", "45", "60", "75", "90"]).optional(),
  components: z.array(z.enum(["warm_up", "strength", "skill", "metcon", "accessory", "cool_down", "mobility"])).default([]),
  strength_method: z.enum(["percentages", "rpe", "linear", "531", "olympic_focus", "bodybuilding", "minimal"]).optional(),
  strength_notes: z.string().trim().max(500).optional(),
  metcon_formats: z.array(z.enum(["amrap", "for_time", "emom", "intervals", "chipper", "partner", "long_aerobic"])).default([]),
  time_domains: z.array(z.enum(["short_under_8", "medium_8_15", "long_15_30", "very_long_30_plus"])).default([]),
  intensity: z.enum(["mostly_hard", "mixed", "mostly_aerobic"]).optional(),
  days_per_week: z.number().int().min(3).max(7).optional(),
  deload_every_weeks: z.enum(["none", "4", "6", "8"]).optional(),
  cycle_weeks: z.enum(["4", "6", "8", "12"]).optional(),
  favorite_movements: z.string().trim().max(500).optional(),
  avoid_movements: z.string().trim().max(500).optional(),
  scaling_order: z.enum(["load_first", "reps_first", "movement_first"]).optional(),
  style_description: z.string().trim().max(1500).optional(),
  example_wod: z.string().trim().max(1500).optional(),
});

export type ProgrammingStyleAnswers = z.infer<typeof programmingStyleSchema>;
export const PROGRAMMING_STYLE_GUIDANCE =
  "Use this coach's programming style as guidance when you write or change training. It never overrides safety rules, injuries, available equipment, or the coach's assistant rules.";

export function appendProgrammingStyle(system: string, note: string | null) {
  return note ? `${system}\n\n${note}\n${PROGRAMMING_STYLE_GUIDANCE}` : system;
}

export function writeWorkoutSystem(template: string, units: "lb" | "kg", note: string | null) {
  return appendProgrammingStyle(template.replace("<units>", units), note);
}

const labels: Record<string, string> = {
  beginners: "Beginners", general_fitness: "General fitness", competitors: "Competitors",
  older_adults: "Older adults", weight_loss: "Weight loss", youth: "Youth", endurance: "Endurance athletes",
  group: "Group classes", one_on_one: "One-on-one", online: "Online coaching",
  warm_up: "Warm-up", strength: "Strength", skill: "Skill work", metcon: "Metcon",
  accessory: "Accessory work", cool_down: "Cool-down", mobility: "Mobility",
  percentages: "Percentage-based", rpe: "RPE-based", linear: "Linear progression",
  "531": "5/3/1", olympic_focus: "Olympic lifting focus", bodybuilding: "Bodybuilding", minimal: "Minimal strength work",
  amrap: "AMRAP", for_time: "For time", emom: "EMOM", intervals: "Intervals",
  chipper: "Chippers", partner: "Partner workouts", long_aerobic: "Long aerobic pieces",
  short_under_8: "Under 8 minutes", medium_8_15: "8–15 minutes", long_15_30: "15–30 minutes",
  very_long_30_plus: "Over 30 minutes", mostly_hard: "Mostly hard", mixed: "Mixed intensity",
  mostly_aerobic: "Mostly aerobic", none: "No scheduled deload", "4": "Every 4 weeks",
  "6": "Every 6 weeks", "8": "Every 8 weeks", "12": "12-week cycles",
  load_first: "Reduce load first", reps_first: "Reduce reps first", movement_first: "Change the movement first",
};

export function programmingStyleNote(answers: unknown | null): string | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const parsed = programmingStyleSchema.safeParse(answers);
  if (!parsed.success) return null;
  const a = parsed.data;
  const lines: string[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`);
  };
  const addList = (label: string, values: string[]) => {
    if (values.length) lines.push(`${label}: ${values.map((v) => labels[v] ?? v).join(", ")}`);
  };
  addList("Athletes", a.athlete_types);
  add("Coaching format", a.format && labels[a.format]);
  add("Session length", a.session_minutes && `${a.session_minutes} minutes`);
  addList("Session components", a.components);
  add("Strength approach", a.strength_method && labels[a.strength_method]);
  add("Strength notes", a.strength_notes);
  addList("Metcon formats", a.metcon_formats);
  addList("Time domains", a.time_domains);
  add("Intensity", a.intensity && labels[a.intensity]);
  add("Training days per week", a.days_per_week?.toString());
  add("Deload", a.deload_every_weeks && labels[a.deload_every_weeks]);
  add("Cycle length", a.cycle_weeks && `${a.cycle_weeks} weeks`);
  add("Favorite movements", a.favorite_movements);
  add("Movements to avoid", a.avoid_movements);
  add("Scaling order", a.scaling_order && labels[a.scaling_order]);
  add("Style description", a.style_description);
  add("Example WOD", a.example_wod);
  return lines.length ? `Coach programming style:\n${lines.join("\n")}` : null;
}

export async function coachProgrammingStyleNote(supabase: SupabaseClient<Database>, coachId: string) {
  const { data } = await supabase.from("coach_programming_styles").select("status, answers").eq("coach_id", coachId).maybeSingle();
  return data?.status === "completed" ? programmingStyleNote(data.answers) : null;
}

export async function athleteProgrammingStyleNote(supabase: SupabaseClient<Database>, athleteId: string) {
  const { data, error } = await supabase.rpc("programming_style_for_athlete", { p_athlete_id: athleteId });
  return error ? null : programmingStyleNote(data as Json | null);
}
