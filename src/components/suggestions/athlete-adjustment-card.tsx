import Link from "next/link";

import { athleteAdjustmentStatus } from "./athlete-adjustment-review";
import { MarkReviewedForm } from "./athlete-adjustment-forms";
import { Badge } from "@/components/ui/badge";
import { athleteAdjustInputSchema, athleteAdjustSchema } from "@/lib/ai/athlete-adjust-schema";
import type { Tables } from "@/lib/supabase/database.types";

export function AthleteAdjustmentCard({ suggestion }: { suggestion: Tables<"ai_suggestions"> }) {
  const status = athleteAdjustmentStatus(suggestion);
  const input = athleteAdjustInputSchema.safeParse(suggestion.input).data;
  const adjustment = athleteAdjustSchema.safeParse(suggestion.final ?? suggestion.proposal).data;
  const applied = suggestion.status === "approved" || suggestion.status === "edited";

  return (
    <section aria-label="Athlete workout adjustment" className="grid gap-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Athlete workout adjustment</h2>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      {input && <p>{input.workout.title} · {input.scheduled_on}</p>}
      {adjustment && <p className="whitespace-pre-wrap text-muted-foreground">{adjustment.summary}</p>}
      <div className="flex flex-wrap items-start gap-3">
        {applied && !suggestion.coach_reviewed_at && <MarkReviewedForm id={suggestion.id} />}
        <Link href={`/suggestions/${suggestion.id}`} className="py-2 underline underline-offset-4">{applied ? "Edit" : "Full review"}</Link>
      </div>
    </section>
  );
}
