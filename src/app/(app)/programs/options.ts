import type { Enums } from "@/lib/supabase/database.types";

export const WORKOUT_TYPES = ["for_time", "amrap", "emom", "strength", "other"] as const;
export const CATEGORIES = ["weightlifting", "gymnastics", "monostructural", "other"] as const;
export const MEASURES = ["reps", "load", "distance", "calories", "time"] as const;

export const WORKOUT_TYPE_LABELS: Record<Enums<"workout_type">, string> = {
  for_time: "For time",
  amrap: "AMRAP",
  emom: "EMOM",
  strength: "Strength",
  other: "Other",
};

export const CATEGORY_LABELS: Record<Enums<"movement_category">, string> = {
  weightlifting: "Weightlifting",
  gymnastics: "Gymnastics",
  monostructural: "Monostructural",
  other: "Other",
};

export const MEASURE_LABELS: Record<Enums<"movement_measure">, string> = {
  reps: "Reps",
  load: "Load",
  distance: "Distance",
  calories: "Calories",
  time: "Time",
};

export const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
