import Link from "next/link";
import { ApproveProgramForm, RejectSuggestionForm } from "./suggestion-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { draftProgramInputSchema, draftProgramStoredSchema } from "@/lib/ai/draft-program-schema";
import { friendlySuggestionError } from "@/lib/ai/service-core";
import type { Tables } from "@/lib/supabase/database.types";

export function DraftProgramReview({ suggestion }: { suggestion: Tables<"ai_suggestions"> }) {
  const decided = ["approved", "edited"].includes(suggestion.status);
  const parsed = draftProgramStoredSchema.safeParse(decided ? suggestion.final : suggestion.proposal);
  const input = draftProgramInputSchema.safeParse(suggestion.input);
  const names = new Map(input.success ? input.data.library.map((m) => [m.id, m.name]) : []);
  const units = input.success ? input.data.units : "kg";
  return <div className="mx-auto grid max-w-4xl gap-5">
    <Link href="/settings/ai-history" className="text-sm underline">Back to AI history</Link>
    {suggestion.athlete_id && <Link href={`/athletes/${suggestion.athlete_id}?tab=intake`} className="text-sm underline">Athlete intake</Link>}
    <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold">Draft first 4 weeks</h1><Badge variant="secondary">{suggestion.status}</Badge></div>
    {suggestion.status === "failed" && <p role="alert">{friendlySuggestionError(suggestion.error)}</p>}
    {parsed.success ? <>
      <Card><CardHeader><CardTitle>{parsed.data.name}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="whitespace-pre-wrap">{parsed.data.rationale}</p><p className="text-sm">Starts {parsed.data.start_date} · Loads in {units}</p><p className="text-sm text-muted-foreground">General fitness guidance. Review injuries, equipment and progression before approving.</p></CardContent></Card>
      {parsed.data.weeks.map((week) => <Card key={week.week_number}><CardHeader><CardTitle>Week {week.week_number}</CardTitle></CardHeader><CardContent className="grid gap-5">{week.workouts.map((w) => <section key={w.day_number} className="space-y-2 rounded-md border p-4">
        <h3 className="font-semibold">Day {w.day_number}: {w.title}</h3><p className="text-sm">{w.workout_type.replaceAll("_", " ")}{w.time_cap_minutes ? ` · ${w.time_cap_minutes} min cap` : ""}{w.rounds ? ` · ${w.rounds} rounds` : ""}</p>
        <p className="whitespace-pre-wrap text-sm">{w.description}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{w.notes}</p>
        <ul className="list-disc space-y-2 pl-5">{w.movements.map((m, i) => <li key={i} className="text-sm"><strong>{names.get(m.movement_id) ?? "Unavailable movement"}</strong>: {[m.sets == null ? null : `${m.sets} sets`, m.reps == null ? null : `${m.reps} reps`, m.load == null ? null : `${m.load} ${units}`, m.distance_m == null ? null : `${m.distance_m} m`, m.calories == null ? null : `${m.calories} cal`, m.duration_seconds == null ? null : `${m.duration_seconds} sec`].filter(Boolean).join(" · ")}{m.notes && <p className="text-muted-foreground">{m.notes}</p>}</li>)}</ul>
      </section>)}</CardContent></Card>)}
      {suggestion.status === "pending" && <Card><CardHeader><CardTitle>Review & approve</CardTitle></CardHeader><CardContent className="grid gap-4"><ApproveProgramForm id={suggestion.id} name={parsed.data.name} startDate={parsed.data.start_date} /><RejectSuggestionForm id={suggestion.id} /></CardContent></Card>}
    </> : suggestion.status !== "failed" && <p>This draft could not be read. Request a new suggestion.</p>}
    {decided && suggestion.target_id && <Link href={`/programs/${suggestion.target_id}`} className="underline">Open assigned personal program</Link>}
  </div>;
}
