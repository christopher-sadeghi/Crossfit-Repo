import { z } from "zod";
import { foodPreferencesFormSchema } from "./food-preferences";
import { ftInToCm } from "./height";

export const INTAKE_STEPS = ["About you", "Training history", "Goals", "Injuries & limitations", "Schedule & equipment", "Nutrition", "Lifestyle", "Health & safety"];
export const EQUIPMENT = ["Barbell", "Plates", "Rack", "Dumbbells", "Kettlebells", "Pull-up bar", "Rings", "Box", "Rower", "Bike", "Jump rope", "None"] as const;
export const GOAL_CATEGORIES = ["Strength", "Conditioning", "Body composition", "Specific skill", "Competition"] as const;
export const GOAL_OPTIONS: Record<(typeof GOAL_CATEGORIES)[number], readonly string[]> = {
  Strength: ["Raise back squat 1RM", "Raise front squat 1RM", "Raise deadlift 1RM", "Raise strict press 1RM", "Raise bench press 1RM", "Raise clean & jerk 1RM", "Raise snatch 1RM", "Get stronger overall"],
  Conditioning: ["Faster 5k run", "Faster 2k row", "Faster benchmark WOD time (e.g. Fran, Helen)", "Better engine for long WODs (20+ min)", "Recover faster between rounds"],
  "Body composition": ["Lose body fat", "Build muscle", "Reach a target body weight", "Keep my weight while getting stronger"],
  "Specific skill": ["First strict pull-up", "First kipping or butterfly pull-up", "First chest-to-bar pull-up", "First toes-to-bar", "First double-unders", "First handstand push-up", "First handstand walk", "First bar muscle-up", "First ring muscle-up", "First pistol squat", "First rope climb"],
  Competition: ["Do my first local competition", "Move up to the Rx division", "Improve my CrossFit Open ranking", "Qualify for the next stage after the Open", "Peak for a specific event date"],
};
const text = z.string().trim().max(2000);
const requiredNumber = (schema: z.ZodNumber) => z.preprocess((v) => v === "" || v == null ? undefined : v, z.coerce.number().pipe(schema));
const optionalNumber = z.preprocess((v) => v === "" || v == null ? null : v, z.coerce.number().finite().nullable());
export const injurySchema = z.object({ area: z.string().trim().min(1).max(80), severity: z.enum(["mild", "moderate", "severe"]), notes: text });
export const healthScreeningSchema = z.object({
  heart_condition: z.boolean(),
  chest_pain_activity: z.boolean(),
  chest_pain_rest: z.boolean(),
  dizziness_or_fainting: z.boolean(),
  bone_joint_problem: z.boolean(),
  blood_pressure_or_heart_meds: z.boolean(),
  doctor_advised_no_exercise: z.boolean(),
  pregnant: z.enum(["no", "yes", "prefer_not"]),
  recent_surgery: z.boolean(),
  surgery_details: z.string().trim().max(500),
  medications: z.string().trim().max(1000).optional(),
  conditions: z.string().trim().max(1000).optional(),
  emergency_contact: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().regex(/^[0-9+() -]{7,30}$/),
    relationship: z.string().trim().min(1).max(50),
  }),
}).superRefine((value, context) => {
  if (value.recent_surgery && !value.surgery_details) {
    context.addIssue({ code: "custom", path: ["surgery_details"], message: "Add a few details about your recent surgery." });
  }
});
export type HealthScreening = z.infer<typeof healthScreeningSchema>;
export function healthFlag(screening: Partial<HealthScreening> | null | undefined) {
  return Boolean(screening && (
    screening.heart_condition
    || screening.chest_pain_activity
    || screening.chest_pain_rest
    || screening.dizziness_or_fainting
    || screening.bone_joint_problem
    || screening.blood_pressure_or_heart_meds
    || screening.doctor_advised_no_exercise
    || screening.pregnant === "yes"
    || screening.recent_surgery
  ));
}
export function injuryPrefill(answers: Record<string, unknown>, injuries: string | null | undefined) {
  const injury_list = Array.isArray(answers.injury_list) && answers.injury_list.length ? answers.injury_list
    : answers.no_injuries === true || !injuries?.trim() || injuries.trim().toLowerCase() === "none" ? []
    : [{ area: "Existing limitation", severity: "mild", notes: injuries }];
  return { injury_list, no_injuries: injury_list.length === 0 && answers.no_injuries === true };
}
export const benchmarkInputSchema = z.object({
  benchmark_id: z.string().uuid(), load: optionalNumber.pipe(z.number().min(0).max(2000).nullable()),
  time_seconds: optionalNumber.pipe(z.number().int().positive().max(86400).nullable()),
  rounds: optionalNumber.pipe(z.number().int().min(0).max(10000).nullable()),
  reps: optionalNumber.pipe(z.number().int().min(0).max(100000).nullable()),
});
export const goalInputSchema = z.union([
  z.object({ id: z.string().uuid(), status: z.literal("achieved") }),
  z.object({ id: z.string().uuid().optional(), category: z.enum(GOAL_CATEGORIES), target: z.string().trim().max(200), target_value: optionalNumber, target_date: z.union([z.literal(""), z.string().date()]), original: z.object({ title: z.string(), target: z.string(), category: z.enum(GOAL_CATEGORIES), goal_type: z.string(), target_value: z.number().nullable(), target_date: z.string().nullable() }).optional() }),
]);
export function goalPrefill(goal: { id: string; status: string; title: string; goal_type: string; target_value: number | null; target_date: string | null }, savedCategory?: unknown) {
  const category = goal.goal_type === "body_composition" ? "Body composition" : goal.goal_type === "skill" ? "Specific skill"
    : GOAL_CATEGORIES.find((c) => c !== "Body composition" && c !== "Specific skill" && c === savedCategory)
      ?? GOAL_CATEGORIES.find((c) => c !== "Body composition" && c !== "Specific skill" && (goal.title === c || goal.title.startsWith(`${c}:`))) ?? "Strength";
  const prefix = GOAL_CATEGORIES.find((c) => goal.title === c || goal.title.startsWith(`${c}: `));
  const target = prefix ? goal.title === prefix ? "" : goal.title.slice(prefix.length + 2) : goal.title;
  return { id: goal.id, status: goal.status, category,
    target, target_value: goal.target_value ?? "", target_date: goal.target_date ?? "",
    original: { title: goal.title, target, category, goal_type: goal.goal_type, target_value: goal.target_value, target_date: goal.target_date },
  };
}
export function goalPayload(goal: z.infer<typeof goalInputSchema>) {
  if ("status" in goal) return { id: goal.id };
  const title = goal.id && goal.original && goal.target === goal.original.target ? goal.original.title : `${goal.category}${goal.target ? `: ${goal.target}` : ""}`;
  const goal_type = goal.category === "Body composition" ? "body_composition" : goal.category === "Specific skill" ? "skill" : "performance";
  const fields = { title, category: goal.category, goal_type, target_value: goal.target_value, target_date: goal.target_date || null };
  return { id: goal.id, ...Object.fromEntries(Object.entries(fields).filter(([key, value]) => !goal.id || !goal.original || value !== goal.original[key as keyof typeof fields])) };
}
export const intakeSchemas = [
  z.object({ birth_date: z.string().date(), sex: z.enum(["", "female", "male", "other"]), height_ft: z.coerce.number().int().min(3).max(8), height_in: z.coerce.number().min(0).lt(12), weight: z.coerce.number().positive().max(2000) })
    .refine((v) => { const cm = ftInToCm(v.height_ft, v.height_in); return cm >= 98.73 && cm <= 251.27; }, "Height must be between 3 ft 4 in and 8 ft 2 in."),
  z.object({ experience_level: z.enum(["beginner", "intermediate", "advanced", "competitor"]), crossfit_detail: text, years_training: requiredNumber(z.number().min(0).max(100)), sports_background: text, benchmarks: z.array(benchmarkInputSchema).max(30) }),
  z.object({ goals: z.array(goalInputSchema).min(1, "Choose at least one goal.").max(6, "Choose up to six goals.") })
    .refine((v) => {
      const goals = v.goals.flatMap((goal) => "category" in goal ? [`${goal.category}\u0000${goal.target.toLowerCase()}`] : []);
      return new Set(goals).size === goals.length;
    }, "You've added that goal twice."),
  z.object({ injury_list: z.array(injurySchema).max(20), no_injuries: z.boolean().default(false) }).refine((v) => v.no_injuries ? v.injury_list.length === 0 : v.injury_list.length > 0, "Add a limitation or confirm you have no injuries."),
  z.object({ days_per_week: z.coerce.number().int().min(1).max(7), session_minutes: z.coerce.number().int().min(10).max(300), location: z.enum(["gym", "home", "travel"]), equipment: z.array(z.enum(EQUIPMENT)).min(1).max(EQUIPMENT.length) }).refine((v) => !v.equipment.includes("None") || v.equipment.length === 1, "Choose equipment or None, not both."),
  foodPreferencesFormSchema.extend({ eating_habits: text }),
  z.object({ sleep_hours: requiredNumber(z.number().min(0).max(24)), stress_level: z.enum(["low", "moderate", "high"]), job_activity: z.enum(["sedentary", "light", "moderate", "physical"] ) }),
  healthScreeningSchema,
] as const;

export type IntakeFormValues = Record<string, unknown>;
