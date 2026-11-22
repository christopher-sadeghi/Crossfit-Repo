"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { loadInlineSuggestion } from "@/app/(app)/suggestions/inline-actions";
import { Badge } from "@/components/ui/badge";
import type { InlineSuggestion } from "@/lib/ai/inline-suggestion";
import { InlineDecisionContext } from "./inline-decision";
import { ScaleWorkoutReview } from "./scale-workout-review";
import { ApproveProgramForm, ApproveProgressSummaryForm, ApproveSuggestionForm, ApproveWeeklyReportForm, ApproveWorkoutSuggestionForm, RejectSuggestionForm } from "./suggestion-forms";

export function InlineSuggestionCard({ id, suggestion, onOpenReview }: {
  id: string;
  suggestion?: InlineSuggestion;
  onOpenReview?: () => void;
}) {
  const [loaded, setLoaded] = useState<InlineSuggestion | null>();
  const [loadError, setLoadError] = useState(false);
  const [warning, setWarning] = useState<string>();
  const refresh = useCallback((warning?: string) => {
    setWarning(warning);
    void loadInlineSuggestion(id).then((next) => {
      setLoaded(next);
      setLoadError(!next);
    }).catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => {
    if (!suggestion) refresh();
  }, [suggestion, refresh]);

  const card = suggestion?.status !== "pending" && suggestion ? suggestion : loaded ?? suggestion;
  if (!card) return <p className="text-sm text-muted-foreground" role="status">{loadError ? "Couldn't load this AI suggestion." : "Loading AI suggestion…"}</p>;
  const pending = card.status === "pending";
  return (
    <InlineDecisionContext.Provider value={refresh}>
      <section aria-label={card.label} className="grid min-w-0 gap-3 break-words rounded-lg border bg-card p-3 text-sm text-card-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">{card.label}{card.athleteName ? ` · ${card.athleteName}` : ""}</div>
          <Badge variant={card.status === "failed" ? "destructive" : pending ? "secondary" : "outline"} className="capitalize">{card.status}</Badge>
        </div>
        {card.type === "adjust_macros" && <>
          {pending ? <ApproveSuggestionForm id={id} values={card.values} /> : <p>{card.values.calories} kcal · Protein {card.values.protein_g} g · Carbs {card.values.carbs_g} g · Fat {card.values.fat_g} g</p>}
          <p className="text-muted-foreground">{card.values.rationale}</p>
        </>}
        {card.type === "scale_workout" && <>
          <p className="font-medium">{card.title}</p>
          <ScaleWorkoutReview id={id} summary={card.summary} rationale={card.rationale} units={card.units} movements={card.movements} editable={pending} hasExistingScaling={false} inline />
        </>}
        {card.type === "progress_summary" && (pending
          ? <ApproveProgressSummaryForm id={id} summary={card.summary} header={card.header} goalLines={card.goalLines} compact />
          : <p className="whitespace-pre-wrap">{card.summary}</p>)}
        {card.type === "write_workout" && <>
          <p className="font-medium">{card.title}{card.scheduledOn ? ` · ${card.scheduledOn}` : ""}</p>
          <p>{card.format}{card.rounds != null ? ` · ${card.rounds} rounds` : ""}{card.timeCapMinutes != null ? ` · ${card.timeCapMinutes} min cap` : ""}</p>
          <p className="whitespace-pre-wrap">{card.description}</p>
          <ul className="list-disc pl-5">{card.movements.map((movement, index) => <li key={index}>{movement}</li>)}</ul>
          {card.notes && <p className="whitespace-pre-wrap">Notes: {card.notes}</p>}
          {pending && <ApproveWorkoutSuggestionForm id={id} mode={card.mode} defaultSaveAs="new" resultCount={0} compact />}
        </>}
        {card.type === "draft_program" && <>
          <p className="font-medium">{card.name} · Starts {card.startDate}</p>
          <p>{card.rationale}</p>
          <details open={card.workouts.length <= 7}>
            <summary className="cursor-pointer font-medium">Scheduled workouts ({card.workouts.length})</summary>
            <ul className="mt-1 list-disc pl-5">{card.workouts.map((workout) => (
              <li key={`${workout.week}-${workout.day}`}>Week {workout.week}, day {workout.day} · {workout.title}</li>
            ))}</ul>
          </details>
          {pending && <ApproveProgramForm id={id} name={card.name} startDate={card.startDate} compact />}
        </>}
        {card.type === "weekly_report" && <>
          <p className="whitespace-pre-wrap">{card.report.summary}</p>
          <ul className="list-disc pl-5">{card.report.focus.map((point, index) => <li key={index}>{point}</li>)}</ul>
          {pending && <ApproveWeeklyReportForm id={id} report={card.report} compact />}
        </>}
        {card.type === "failed" && <p>{card.error}</p>}
        {card.type === "unavailable" && pending && <p>The preview is unavailable.</p>}
        {warning && <p role="alert">{warning}</p>}
        {loadError && <p role="alert">Couldn&apos;t refresh the decision. Open the full review to check its status.</p>}
        <div className="flex flex-wrap items-start gap-3">
          <Link href={`/suggestions/${id}`} onClick={onOpenReview} className="py-2 text-sm underline underline-offset-4">{pending ? "Edit / full review" : "Full review"}</Link>
          {pending && <RejectSuggestionForm id={id} />}
        </div>
      </section>
    </InlineDecisionContext.Provider>
  );
}
