import { z } from "zod";
import { foodPreferencesFormSchema } from "./food-preferences";
import { ftInToCm } from "./height";

export const INTAKE_STEPS = ["About you", "Training history", "Goals", "Injuries & limitations", "Schedule & equipment", "Nutrition", "Lifestyle"];
export const EQUIPMENT = ["Barbell", "Plates", "Rack", "Dumbbells", "Kettlebells", "Pull-up bar", "Rings", "Box", "Rower", "Bike", "Jump rope", "None"] as const;
export const GOAL_CATEGORIES = ["Strength", "Conditioning", "Body composition", "Specific skill", "Competition"] as const;
const text = z.string().trim().max(2000);
const requiredNumber = (schema: z.ZodNumber) => z.preprocess((v) => v === "" || v == null ? undefined : v, z.coerce.number().pipe(schema));
const optionalNumber = z.preprocess((v) => v === "" || v == null ? null : v, z.coerce.number().finite().nullable());
export const injurySchema = z.object({ area: z.string().trim().min(1).max(80), severity: z.enum(["mild", "moderate", "severe"]), notes: text });
export const benchmarkInputSchema = z.object({
  benchmark_id: z.string().uuid(), load: optionalNumber.pipe(z.number().min(0).max(2000).nullable()),
  time_seconds: optionalNumber.pipe(z.number().int().positive().max(86400).nullable()),
  rounds: optionalNumber.pipe(z.number().int().min(0).max(10000).nullable()),
  reps: optionalNumber.pipe(z.number().int().min(0).max(100000).nullable()),
});
export const goalInputSchema = z.object({ category: z.enum(GOAL_CATEGORIES), target: z.string().trim().max(200), target_value: optionalNumber, target_date: z.union([z.literal(""), z.string().date()]) });
export const intakeSchemas = [
  z.object({ birth_date: z.string().date(), sex: z.enum(["", "female", "male", "other"]), height_ft: z.coerce.number().int().min(3).max(8), height_in: z.coerce.number().min(0).lt(12), weight: z.coerce.number().positive().max(2000) })
    .refine((v) => { const cm = ftInToCm(v.height_ft, v.height_in); return cm >= 98.73 && cm <= 251.27; }, "Height must be between 3 ft 4 in and 8 ft 2 in."),
  z.object({ experience_level: z.enum(["beginner", "intermediate", "advanced", "competitor"]), crossfit_detail: text, years_training: requiredNumber(z.number().min(0).max(100)), sports_background: text, benchmarks: z.array(benchmarkInputSchema).max(30) }),
  z.object({ goals: z.array(goalInputSchema).min(1, "Choose at least one goal.").max(3, "Choose up to three goals.") }).refine((v) => new Set(v.goals.map((g) => g.category)).size === v.goals.length, "Choose each goal category once."),
  z.object({ injury_list: z.array(injurySchema).max(20) }),
  z.object({ days_per_week: z.coerce.number().int().min(1).max(7), session_minutes: z.coerce.number().int().min(10).max(300), location: z.enum(["gym", "home", "travel"]), equipment: z.array(z.enum(EQUIPMENT)).min(1).max(EQUIPMENT.length) }).refine((v) => !v.equipment.includes("None") || v.equipment.length === 1, "Choose equipment or None, not both."),
  foodPreferencesFormSchema.extend({ eating_habits: text }),
  z.object({ sleep_hours: requiredNumber(z.number().min(0).max(24)), stress_level: z.enum(["low", "moderate", "high"]), job_activity: z.enum(["sedentary", "light", "moderate", "physical"] ) }),
] as const;

export type IntakeFormValues = Record<string, unknown>;
