import { z } from "zod";

import { toKg, type Units } from "@/lib/units";

import { scaleWorkoutInputSchema } from "./scale-workout";
import { scaleWorkoutChangeSchema } from "./scale-workout-schema";

export { effectiveScaling } from "@/lib/workout-scaling";

export const athleteAdjustSchema = z.object({
  asked_for_harder: z.boolean(),
  summary: z.string().min(1).max(300),
  rounds: z.number().int().min(1).max(100).nullable(),
  time_cap_minutes: z.number().min(1).max(180).nullable(),
  changes: z.array(scaleWorkoutChangeSchema).min(1).max(30),
  rationale: z.string().min(1).max(1000),
});

export type AthleteAdjustProposal = z.infer<typeof athleteAdjustSchema>;

const baselineMovementSchema = z.object({
  movement_id: z.string(),
  name: z.string(),
  sets: z.number().nullable(),
  reps: z.number().nullable(),
  load: z.number().nullable(),
  distance_m: z.number().nullable(),
  calories: z.number().nullable(),
  duration_seconds: z.number().nullable(),
});

export const athleteAdjustInputSchema = scaleWorkoutInputSchema.extend({
  scheduled_on: z.string(),
  feeling: z.string(),
  mentions_pain: z.boolean(),
  scaling_updated_at: z.string().nullable(),
  /** What the athlete was given before this request: the coach's scaling if any, else the WOD. */
  current: z.object({
    coach_note: z.string().nullable(),
    rounds: z.number().nullable(),
    time_cap_seconds: z.number().nullable(),
    movements: z.array(baselineMovementSchema),
  }),
});

export type AthleteAdjustInput = z.infer<typeof athleteAdjustInputSchema>;

export { CHECK_WITH_COACH_MESSAGE } from "./athlete-adjust-copy";

const PAIN_PATTERN =
  /\b(pain\w*|hurts?|hurting|hurt|aches?|aching|achy|sore|soreness|injur\w*|tweak\w*|strain\w*|sprain\w*|swollen|swelling|numb\w*|tingl\w*|throbb\w*|twinge\w*|pinch\w*)\b/i;
const EXPLICIT_NO_PAIN =
  /\bno\s+pain(?:\s*(?:\/|or\b|and\b)\s*(?:illness|injur(?:y|ies)))?(?=\s*(?:[.!;]|$|,\s*just\b))/gi;

export function mentionsPain(text: string) {
  return PAIN_PATTERN.test(text.replace(EXPLICIT_NO_PAIN, ""));
}

// The AI must not diagnose or suggest treatment; anything like this is thrown away.
const MEDICAL_ADVICE_PATTERN =
  /\b(ibuprofen|advil|motrin|tylenol|acetaminophen|paracetamol|aspirin|naproxen|aleve|painkillers?|medications?|medicine|diagnos\w*|tendinitis|tendonitis|bursitis|meniscus|ligament|fracture|ice it|icing|heat pack|anti-inflammator\w*)\b/i;

// High-skill movements an easier version should never switch into.
const ADVANCED_MOVEMENTS = new Set(
  [
    "bar muscle-up",
    "ring muscle-up",
    "muscle-up",
    "handstand push-up",
    "strict handstand push-up",
    "handstand walk",
    "pistol",
    "pistol squat",
    "rope climb",
    "legless rope climb",
    "chest-to-bar pull-up",
    "toes-to-bar",
    "double-under",
    "ghd sit-up",
    "ring dip",
    "squat snatch",
    "squat clean",
    "clean and jerk",
    "split jerk",
    "overhead squat",
    "snatch",
  ].map((name) => name.toLowerCase()),
);

/** Thrown when the AI proposal would make today's WOD harder. The message is shown to the athlete. */
export class HarderChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarderChangeError";
  }
}

export class NoChangeError extends Error {
  constructor() {
    super("The AI didn't find anything to make easier, so your WOD is unchanged.");
    this.name = "NoChangeError";
  }
}

const KEPT_FIELDS = ["sets", "reps", "load", "distance_m", "calories", "duration_seconds"] as const;
const FIELD_WORDS: Record<(typeof KEPT_FIELDS)[number], string> = {
  sets: "more sets",
  reps: "more reps",
  load: "a heavier load",
  distance_m: "a longer distance",
  calories: "more calories",
  duration_seconds: "more time",
};

const harder = (what: string) =>
  new HarderChangeError(`The AI suggested ${what}, which would make the workout harder, so nothing was changed.`);

/**
 * Checks the proposal against what the athlete was given and returns a cleaned copy:
 * blanks on kept movements mean "unchanged". Throws HarderChangeError for anything harder.
 */
export function normalizeAthleteAdjustment(proposal: unknown, rawInput: unknown): AthleteAdjustProposal {
  const parsed = athleteAdjustSchema.parse(proposal);
  const input = athleteAdjustInputSchema.parse(rawInput);
  const units = input.units as Units;
  if (parsed.asked_for_harder)
    throw new HarderChangeError(
      "This can only make today's WOD easier or safer, so nothing was changed. Ask your coach if you want more.",
    );

  const original = input.workout.movements;
  const base = input.current.movements;
  if (parsed.changes.length !== original.length || base.length !== original.length)
    throw new Error("adjusted movement count mismatch");
  const library = new Map(input.library.map((movement) => [movement.id, movement]));
  const text = [parsed.summary, parsed.rationale, ...parsed.changes.map(({ reason }) => reason)].join(" ");
  if (MEDICAL_ADVICE_PATTERN.test(text)) throw new Error("adjustment contained medical advice");

  const changes = parsed.changes.map((change, index) => {
    const originalMovement = original[index]!;
    const baseMovement = base[index]!;
    if (change.original_movement_id !== originalMovement.movement_id) throw new Error("original movement id mismatch");
    const movement = library.get(change.movement_id);
    if (!movement) throw new Error("unknown movement id");

    if (change.movement_id === baseMovement.movement_id) {
      const next = { ...change };
      for (const field of KEPT_FIELDS) {
        const was = baseMovement[field];
        if (was == null) {
          next[field] = null;
          continue;
        }
        const value = next[field] ?? was;
        next[field] = value;
        const tooMuch = field === "load" ? toKg(value, units) > toKg(was, units) + 0.5 : value > was;
        if (tooMuch) throw harder(`${FIELD_WORDS[field]} for ${baseMovement.name}`);
      }
      return next;
    }

    if (change.movement_id === originalMovement.movement_id)
      throw harder(`switching back to ${originalMovement.name}, which your coach had scaled`);
    if (ADVANCED_MOVEMENTS.has(movement.name.toLowerCase()))
      throw harder(`switching ${baseMovement.name} to ${movement.name}`);
    if (baseMovement.load != null && change.load != null && toKg(change.load, units) > toKg(baseMovement.load, units) + 0.5)
      throw harder(`a heavier load for ${movement.name}`);
    return change;
  });

  const baseRounds = input.current.rounds;
  let rounds = baseRounds == null ? null : (parsed.rounds ?? baseRounds);
  if (baseRounds != null && rounds != null && rounds > baseRounds) throw harder("more rounds");
  if (rounds != null && rounds < 1) rounds = 1;

  const baseCap = input.current.time_cap_seconds;
  const type = input.workout.workout_type;
  let capSeconds = baseCap == null || parsed.time_cap_minutes == null ? baseCap : Math.round(parsed.time_cap_minutes * 60);
  if (baseCap != null && capSeconds != null) {
    if (type === "for_time") {
      if (capSeconds < baseCap) throw harder("a shorter time cap");
      capSeconds = Math.min(capSeconds, baseCap * 2);
    } else if (type === "amrap" || type === "emom") {
      if (capSeconds > baseCap) throw harder("a longer workout");
      capSeconds = Math.max(capSeconds, Math.min(60, baseCap));
    } else {
      capSeconds = baseCap;
    }
  }

  const unchanged =
    rounds === baseRounds &&
    capSeconds === baseCap &&
    changes.every((change, index) => {
      const was = base[index]!;
      return change.movement_id === was.movement_id && KEPT_FIELDS.every((field) => change[field] === was[field]);
    });
  if (unchanged) throw new NoChangeError();

  return {
    ...parsed,
    rounds,
    time_cap_minutes: capSeconds == null ? null : capSeconds / 60,
    changes,
  };
}
