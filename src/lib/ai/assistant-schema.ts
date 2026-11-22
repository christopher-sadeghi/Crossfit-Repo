import { z } from "zod";
import { activityDraftSchema } from "@/lib/athlete-activities";

export const assistantMessageSchema = z.string().trim().min(1).max(2000);
export const assistantChangeSchema = z.object({
  type: z.enum(["adjust_macros", "scale_workout", "write_workout"]),
  workoutId: z.string().uuid().optional(),
  scheduledOn: z.iso.date().optional(),
  note: z.string().trim().min(1).max(1000),
}).strict().superRefine((change, ctx) => {
  if (change.type === "scale_workout" && !change.workoutId)
    ctx.addIssue({ code: "custom", message: "Choose a WOD to scale.", path: ["workoutId"] });
  if (change.type === "write_workout" && (!change.scheduledOn || change.workoutId))
    ctx.addIssue({ code: "custom", message: "Choose a date for a new WOD, not an existing WOD.", path: ["scheduledOn"] });
});
export const coachMessageDraftSchema = z.object({
  kind: z.literal("coach_message"),
  body: assistantMessageSchema,
  change: assistantChangeSchema.optional(),
}).strict();
export const assistantCardSchema = z.union([
  coachMessageDraftSchema,
  z.object({ kind: z.literal("adjust_wod"), workoutId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("activity"), draft: activityDraftSchema }).strict(),
]);
export type AssistantCard = z.infer<typeof assistantCardSchema>;
export const assistantSettingsSchema = z.object({
  assistant_rules: z.string().trim().max(2000).nullable(),
  assistant_training: z.boolean(),
  assistant_nutrition: z.boolean(),
  assistant_recovery: z.boolean(),
  athlete_ai_daily_limit: z.number().int().min(1).max(200),
}).strict();
export const athleteOverrideSchema = z.string().trim().max(2000).nullable();
