"use client";

import { startTransition, useActionState, useState } from "react";

import { requestSuggestion, requestWorkoutSuggestion } from "@/app/(app)/suggestions/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";

import { InlineSuggestionCard } from "./inline-suggestion-card";

type SuggestionRequestState = FormState & { suggestionId?: string };

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.message) return <p role="status" className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

function RequestAthleteSuggestionForm({
  athleteId,
  type,
  label,
}: {
  athleteId: string;
  type: "adjust_macros" | "progress_summary" | "weekly_report" | "draft_program";
  label: string;
}) {
  const [state, formAction, pending] = useActionState(async () => requestSuggestion(type, athleteId), {} as SuggestionRequestState);

  return (
    <div className="grid gap-3">
      <form action={formAction} className="grid justify-items-start gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Drafting with AI…" : label}
        </Button>
        <Message state={state} />
      </form>
      {state.suggestionId && <InlineSuggestionCard key={state.suggestionId} id={state.suggestionId} />}
    </div>
  );
}

export function RequestMacroSuggestionForm({ athleteId }: { athleteId: string }) {
  return <RequestAthleteSuggestionForm athleteId={athleteId} type="adjust_macros" label="Suggest macros" />;
}

export function RequestIntakeAiForm({ athleteId, type, label }: { athleteId: string; type: "draft_program" | "adjust_macros"; label: string }) {
  return <RequestAthleteSuggestionForm athleteId={athleteId} type={type} label={label} />;
}

export function RequestProgressSummaryForm({ athleteId }: { athleteId: string }) {
  return <RequestAthleteSuggestionForm athleteId={athleteId} type="progress_summary" label="Summarize progress" />;
}

export function RequestWeeklyReportForm({ athleteId }: { athleteId: string }) {
  return <RequestAthleteSuggestionForm athleteId={athleteId} type="weekly_report" label="Draft weekly report" />;
}

export function RequestWorkoutSuggestionForm({ workoutId }: { workoutId?: string }) {
  const [request, setRequest] = useState("");
  const [state, formAction, pending] = useActionState<SuggestionRequestState, FormData>(
    async (previous, formData) => requestWorkoutSuggestion(previous, formData),
    {},
  );
  const quickRequests = ["Make it harder", "Make it easier", "Make it shorter", "No barbell"];

  return (
    <div className="grid gap-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() => formAction(new FormData(event.currentTarget)));
        }}
        className="grid justify-items-start gap-3"
      >
        {workoutId && <input type="hidden" name="workout_id" value={workoutId} />}
        <div className="grid w-full gap-1.5">
          <Label htmlFor="workout-ai-request">{workoutId ? "What should change?" : "What WOD should the AI write?"}</Label>
          <Textarea
            id="workout-ai-request"
            name="request"
            placeholder="20-minute AMRAP, no barbell, focus on engine"
            minLength={3}
            maxLength={500}
            required
            rows={3}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
          />
        </div>
        {workoutId && (
          <div className="flex flex-wrap gap-2">
            {quickRequests.map((quickRequest) => (
              <Button
                key={quickRequest}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRequest(quickRequest)}
              >
                {quickRequest}
              </Button>
            ))}
          </div>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Asking the AI… (up to 45 s)" : workoutId ? "Ask AI to adjust" : "Ask AI to write a WOD"}
        </Button>
        <Message state={state} />
      </form>
      {state.suggestionId && <InlineSuggestionCard key={state.suggestionId} id={state.suggestionId} />}
    </div>
  );
}
