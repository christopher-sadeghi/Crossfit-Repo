import { z } from "zod";

import { fromKgPrecise, toKg, type Units } from "@/lib/units";

const dateSchema = z.iso.date();
const goalTypeSchema = z.enum(["performance", "body_composition", "skill"]);
const goalStatusSchema = z.enum(["active", "achieved", "abandoned"]);
const goalChangeSchema = z.object({
  kind: z.literal("goal"),
  action: z.enum(["create", "update", "set_status"]),
  goal_id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  goal_type: goalTypeSchema.optional(),
  target_value: z.number().min(0).max(100_000).nullable().optional(),
  unit: z.string().trim().max(20).optional(),
  target_date: dateSchema.nullable().optional(),
  status: goalStatusSchema.optional(),
}).strict().superRefine((change, ctx) => {
  if (change.action === "create") {
    if (!change.title || !change.goal_type || change.goal_id || change.status || change.target_value === null || change.target_date === null)
      ctx.addIssue({ code: "custom", message: "A new goal needs a title and type.", path: ["title"] });
  } else if (!change.goal_id) {
    ctx.addIssue({ code: "custom", message: "Choose a goal.", path: ["goal_id"] });
  }
  if (change.action === "update") {
    if (change.title === undefined && change.target_value === undefined && change.target_date === undefined)
      ctx.addIssue({ code: "custom", message: "Provide at least one goal field to update.", path: ["title"] });
    if (change.goal_type !== undefined || change.unit !== undefined || change.status !== undefined)
      ctx.addIssue({ code: "custom", message: "Only the title, target, and target date can be updated.", path: ["action"] });
  }
  if (change.action === "set_status") {
    if (!change.status || change.title !== undefined || change.goal_type !== undefined || change.target_value !== undefined
      || change.unit !== undefined || change.target_date !== undefined)
      ctx.addIssue({ code: "custom", message: "Choose a goal status only.", path: ["status"] });
  }
});

const profileChangeSchema = z.object({
  kind: z.literal("profile"),
  experience_level: z.enum(["beginner", "intermediate", "advanced", "competitor"]).optional(),
  injuries: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).optional(),
}).strict().refine((change) => change.experience_level !== undefined || change.injuries !== undefined || change.notes !== undefined);
const assignedCoachChangeSchema = z.object({ kind: z.literal("assigned_coach"), coach_id: z.string().uuid().nullable() }).strict();
const programChangeSchema = z.object({
  kind: z.literal("program"),
  action: z.enum(["assign", "unassign"]),
  program_id: z.string().uuid(),
  start_date: dateSchema.optional(),
}).strict().superRefine((change, ctx) => {
  if (change.action === "assign" && !change.start_date)
    ctx.addIssue({ code: "custom", message: "Choose a program start date.", path: ["start_date"] });
  if (change.action === "unassign" && change.start_date !== undefined)
    ctx.addIssue({ code: "custom", message: "Unassigning does not use a start date.", path: ["start_date"] });
});
const bodyWeightChangeSchema = z.object({
  kind: z.literal("body_weight"),
  value: z.number().positive().max(1000),
  measured_on: dateSchema,
}).strict();

export const coachAccountChangeSchema = z.discriminatedUnion("kind", [
  profileChangeSchema,
  assignedCoachChangeSchema,
  programChangeSchema,
  bodyWeightChangeSchema,
  goalChangeSchema,
]);

const dietTypeSchema = z.enum([
  "none", "vegetarian", "vegan", "pescatarian", "gluten_free",
  "dairy_free", "low_carb", "paleo", "halal", "kosher",
]);
const macrosSchema = z.object({
  kind: z.literal("macros"),
  calories: z.number().int().min(500).max(10_000),
  protein_g: z.number().int().min(0).max(2000),
  carbs_g: z.number().int().min(0).max(2000),
  fat_g: z.number().int().min(0).max(2000),
  note: z.string().trim().max(500).optional(),
}).strict();

const injuriesChangeSchema = z.object({ kind: z.literal("injuries"), injuries: z.string().max(1000).nullable() }).strict();
const foodPreferencesChangeSchema = z.object({
    kind: z.literal("food_preferences"),
    diet_type: dietTypeSchema.optional(),
    allergies: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    dislikes: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
    cooking_minutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]).nullable().optional(),
  }).strict().refine((change) => change.diet_type !== undefined || change.allergies !== undefined
    || change.dislikes !== undefined || change.cooking_minutes !== undefined);
const athleteWeightChangeSchema = z.object({
  kind: z.literal("body_weight"),
  value: z.number().positive().max(1000),
  measured_on: dateSchema,
}).strict();
const reminderTimeChangeSchema = z.object({
  kind: z.literal("reminder_time"),
  remind_at: z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/).nullable(),
}).strict();

export const athleteAccountChangeSchema = z.discriminatedUnion("kind", [
  goalChangeSchema,
  injuriesChangeSchema,
  foodPreferencesChangeSchema,
  athleteWeightChangeSchema,
  reminderTimeChangeSchema,
  macrosSchema,
]);

export const coachAccountChangeProposalSchema = z.object({
  change: coachAccountChangeSchema,
  before: z.record(z.string(), z.unknown()),
}).strict();

export type CoachAccountChange = z.infer<typeof coachAccountChangeSchema>;
export type AthleteAccountChange = z.infer<typeof athleteAccountChangeSchema>;
export type AccountChange = CoachAccountChange | AthleteAccountChange;
export type AccountChangeLine = { label: string; before: string; after: string };

export function accountChangeWeightKg(value: number, units: Units) {
  return toKg(value, units);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readable(value: unknown, fallback = "Not set") {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function weight(value: unknown, units: Units) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "No weight recorded";
  return `${fromKgPrecise(value, units)} ${units}`;
}

function goalTarget(value: unknown, unit: unknown) {
  if (value == null) return "No target";
  return `${readable(value)}${typeof unit === "string" && unit ? ` ${unit}` : ""}`;
}

export function accountChangeSummaryLines(change: AccountChange, snapshot: unknown, units: Units): AccountChangeLine[] {
  const before = asRecord(snapshot);
  if (change.kind === "profile") {
    const fields = [
      ["Experience level", "experience_level", change.experience_level],
      ["Injuries", "injuries", change.injuries],
      ["Notes", "notes", change.notes],
    ] as const;
    return fields.flatMap(([name, key, next]) => next === undefined ? [] : [{
      label: name,
      before: readable(before[key], key === "injuries" || key === "notes" ? "None recorded" : "Not set"),
      after: readable(next, key === "injuries" ? "None recorded" : "Not set"),
    }]);
  }
  if (change.kind === "injuries") return [{
    label: "Injuries",
    before: readable(before.injuries, "None recorded"),
    after: readable(change.injuries, "None recorded"),
  }];
  if (change.kind === "assigned_coach") return [{
    label: "Assigned coach",
    before: readable(before.coach_name, "Unassigned"),
    after: change.coach_id ? readable(before.target_coach_name, "Coach") : "Unassigned",
  }];
  if (change.kind === "program") {
    const assigned = Array.isArray(before.assigned)
      ? before.assigned.map(asRecord)
      : before.assigned ? [asRecord(before.assigned)] : [];
    const formatAssignment = (assignment: Record<string, unknown>) =>
      `${readable(assignment.name)} · starts ${readable(assignment.start_date)}`;
    const current = assigned.map(formatAssignment);
    const assignedTarget = assigned.find((assignment) => assignment.id === change.program_id);
    const remaining = assigned.filter((assignment) => assignment.id !== change.program_id).map(formatAssignment);
    return [{
      label: change.action === "assign" ? "Program" : "Program assignment",
      before: change.action === "assign"
        ? current.length ? current.join("; ") : "Not assigned"
        : assignedTarget ? formatAssignment(assignedTarget) : "Not assigned",
      after: change.action === "assign"
        ? [...remaining, `${readable(before.target_program_name, "Program")} · starts ${change.start_date}`].join("; ")
        : remaining.length ? remaining.join("; ") : "Not assigned",
    }];
  }
  if (change.kind === "body_weight") {
    const weightUnits = before.units === "kg" || before.units === "lb" ? before.units : units;
    return [{
      label: "Body weight",
      before: weight(before.weight_kg, weightUnits),
      after: `${change.value} ${weightUnits} · ${change.measured_on}`,
    }];
  }
  if (change.kind === "goal") {
    const goal = asRecord(before.goal);
    if (change.action === "create") {
      const target = goalTarget(change.target_value, change.unit);
      return [{
        label: "Goal",
        before: "Not added",
        after: `${change.title ?? "Goal"} · ${label(change.goal_type ?? "performance")}${target === "No target" ? "" : ` · target ${target}`}${change.target_date ? ` · by ${change.target_date}` : ""}`,
      }];
    }
    if (change.action === "set_status") return [{
      label: `Goal · ${readable(goal.title, "Goal")}`,
      before: label(readable(goal.status, "Not set")),
      after: label(change.status ?? "active"),
    }];
    const lines: AccountChangeLine[] = [];
    if (change.title !== undefined) lines.push({ label: "Goal", before: readable(goal.title), after: change.title });
    if (change.target_value !== undefined) lines.push({
      label: `Target · ${readable(goal.title, "Goal")}`,
      before: goalTarget(goal.target_value, goal.unit),
      after: goalTarget(change.target_value, goal.unit),
    });
    if (change.target_date !== undefined) lines.push({
      label: `Target date · ${readable(goal.title, "Goal")}`,
      before: readable(goal.target_date, "No date"),
      after: readable(change.target_date, "No date"),
    });
    return lines;
  }
  if (change.kind === "food_preferences") {
    const lines: AccountChangeLine[] = [];
    if (change.diet_type !== undefined) lines.push({ label: "Diet preference", before: label(readable(before.diet_type, "None")), after: label(change.diet_type) });
    if (change.allergies !== undefined) lines.push({ label: "Allergies", before: readable((before.allergies as string[] | undefined)?.join(", "), "None"), after: readable(change.allergies.join(", "), "None") });
    if (change.dislikes !== undefined) lines.push({ label: "Foods to avoid", before: readable((before.dislikes as string[] | undefined)?.join(", "), "None"), after: readable(change.dislikes.join(", "), "None") });
    if (change.cooking_minutes !== undefined) lines.push({ label: "Cooking time", before: before.cooking_minutes == null ? "Not set" : `${before.cooking_minutes} min`, after: change.cooking_minutes == null ? "Not set" : `${change.cooking_minutes} min` });
    return lines;
  }
  if (change.kind === "reminder_time") return [{
    label: "Check-in reminder",
    before: before.remind_at ? `${readable(before.remind_at)} (${readable(before.time_zone, "UTC")})` : "Off",
    after: change.remind_at ? `${change.remind_at} (${readable(before.time_zone, "UTC")})` : "Off",
  }];
  if (change.kind === "macros") {
    const target = asRecord(before.target);
    return [
      ["Calories", "calories", "kcal"],
      ["Protein", "protein_g", "g"],
      ["Carbohydrates", "carbs_g", "g"],
      ["Fat", "fat_g", "g"],
    ].map(([name, key, unit]) => ({
      label: name,
      before: target[key] == null ? "No target" : `${readable(target[key])} ${unit}`,
      after: `${change[key as keyof typeof change]} ${unit}`,
    }));
  }
  return [];
}
