import { toKg, type Units } from "@/lib/units";
import { normalizeSections } from "@/lib/workout-sections";

type WorkoutSectionProposal = {
  title: string;
  format: "strength" | "for_time" | "amrap" | "emom" | "other";
  time_cap_minutes: number | null;
  rounds: number | null;
};

type WorkoutMovementProposal = {
  movement_id: string;
  sets: number | null;
  reps: number | null;
  load: number | null;
  distance_m: number | null;
  calories: number | null;
  duration_seconds: number | null;
  notes: string | null;
  section: number | null;
};

export function prepareWorkoutSavePayload(
  proposal: {
    title: string;
    workout_type: "for_time" | "amrap" | "emom" | "strength" | "other";
    time_cap_minutes: number | null;
    rounds: number | null;
    description: string | null;
    notes: string | null;
    sections?: WorkoutSectionProposal[];
    movements: WorkoutMovementProposal[];
  },
  units: Units,
) {
  const normalized = normalizeSections(
    (proposal.sections ?? []).map(({ time_cap_minutes, ...section }) => ({
      ...section,
      time_cap_seconds:
        time_cap_minutes == null ? null : time_cap_minutes * 60,
    })),
    proposal.movements,
  );

  return {
    workout: {
      title: proposal.title,
      workout_type: proposal.workout_type,
      time_cap_seconds:
        proposal.time_cap_minutes == null
          ? null
          : proposal.time_cap_minutes * 60,
      rounds: proposal.rounds,
      description: proposal.description,
      notes: proposal.notes,
      sections: normalized.sections,
    },
    movements: normalized.movements.map(({ load, ...movement }) => ({
      ...movement,
      load_kg: load == null ? null : toKg(load, units),
    })),
  };
}
