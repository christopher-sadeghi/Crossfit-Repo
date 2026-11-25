import { WORKOUT_TYPE_LABELS } from "@/app/(app)/programs/options";
import { draftProgramStoredSchema } from "./draft-program-schema";
import { progressNoteParts, progressSummarySchema } from "./progress-summary";
import { scaleReviewMovements } from "./scale-review";
import { scaleWorkoutInputSchema, scaleWorkoutSchema } from "./scale-workout";
import { adjustMacrosSchema, safeParseWriteWorkoutProposal, SUGGESTION_LABELS, writeWorkoutInputSchema } from "./suggestions";
import { friendlySuggestionError } from "./service-core";
import type { Tables } from "@/lib/supabase/database.types";
import { weeklyReportSchema } from "@/lib/weekly-report";
import { accountChangeSummaryLines, coachAccountChangeProposalSchema } from "./account-change";

export type InlineSuggestion = ReturnType<typeof inlineSuggestion>;

export function inlineSuggestion(row: Tables<"ai_suggestions">, athleteName?: string | null) {
  const saved = row.status === "edited" || row.status === "approved";
  const raw = saved ? row.final : row.proposal;
  const base = {
    id: row.id,
    status: row.status === "edited" ? "approved" as const : row.status,
    label: SUGGESTION_LABELS[row.suggestion_type],
    athleteName: athleteName ?? null,
  };
  if (row.status === "failed") return { ...base, type: "failed" as const, error: friendlySuggestionError(row.error) };

  switch (row.suggestion_type) {
    case "adjust_macros": {
      const { data } = adjustMacrosSchema.safeParse(raw);
      if (data) return { ...base, type: row.suggestion_type, values: data };
      break;
    }
    case "scale_workout": {
      const { data } = scaleWorkoutSchema.safeParse(raw);
      const { data: input } = scaleWorkoutInputSchema.safeParse(row.input);
      if (data && input) return {
        ...base, type: row.suggestion_type, summary: data.summary, rationale: data.rationale,
        units: input.units, title: input.workout.title, movements: scaleReviewMovements(data, input),
      };
      break;
    }
    case "progress_summary": {
      const { data } = progressSummarySchema.safeParse(raw);
      if (data) return { ...base, type: row.suggestion_type, summary: data.summary, ...progressNoteParts(data, row.input) };
      break;
    }
    case "write_workout": {
      const { data } = safeParseWriteWorkoutProposal(raw);
      const { data: input } = writeWorkoutInputSchema.safeParse(row.input);
      if (data && input) {
        const names = new Map(input.library.map((movement) => [movement.id, movement.name]));
        return {
          ...base, type: row.suggestion_type, title: data.title, description: data.description,
          format: WORKOUT_TYPE_LABELS[data.workout_type], rounds: data.rounds, timeCapMinutes: data.time_cap_minutes, notes: data.notes,
          sections: data.sections,
          mode: input.mode, scheduledOn: input.scheduled_on,
          movements: data.movements.map((movement) =>
            [movement.section == null ? null : data.sections[movement.section]?.title,
              names.get(movement.movement_id) ?? "Unavailable movement",
              movement.sets == null ? null : `${movement.sets} sets`,
              movement.reps == null ? null : `${movement.reps} reps`,
              movement.load == null ? null : `${movement.load} ${input.units}`,
              movement.distance_m == null ? null : `${movement.distance_m} m`,
              movement.duration_seconds == null ? null : `${movement.duration_seconds} sec`,
              movement.calories == null ? null : `${movement.calories} cal`,
              movement.notes].filter(Boolean).join(" · ")),
        };
      }
      break;
    }
    case "draft_program": {
      const { data } = draftProgramStoredSchema.safeParse(raw);
      if (data) return {
        ...base, type: row.suggestion_type, name: data.name, startDate: data.start_date, rationale: data.rationale,
        workouts: [...data.weeks].sort((a, b) => a.week_number - b.week_number).flatMap((week) =>
          [...week.workouts].sort((a, b) => a.day_number - b.day_number).map((workout) => ({
            week: week.week_number, day: workout.day_number, title: workout.title,
          }))),
      };
      break;
    }
    case "weekly_report": {
      const { data } = weeklyReportSchema.safeParse(raw);
      if (data) return { ...base, type: row.suggestion_type, report: data };
      break;
    }
    case "athlete_account_change": {
      const { data } = coachAccountChangeProposalSchema.safeParse(raw);
      if (data) {
        const units = row.input && typeof row.input === "object" && !Array.isArray(row.input)
          && row.input.units === "kg" ? "kg" : "lb";
        return {
          ...base, type: row.suggestion_type,
          lines: accountChangeSummaryLines(data.change, data.before, units),
        };
      }
      break;
    }
  }
  return { ...base, type: "unavailable" as const };
}
