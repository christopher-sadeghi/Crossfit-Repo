import { ApproveAccountChangeForm, RejectSuggestionForm } from "@/components/suggestions/suggestion-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { accountChangeSummaryLines, coachAccountChangeProposalSchema } from "@/lib/ai/account-change";
import type { Tables } from "@/lib/supabase/database.types";
import type { Units } from "@/lib/units";

export function AthleteAccountChangeReview({
  suggestion,
  athleteName,
  units,
}: {
  suggestion: Tables<"ai_suggestions">;
  athleteName: string;
  units: Units;
}) {
  const parsed = coachAccountChangeProposalSchema.safeParse(
    suggestion.status === "approved" || suggestion.status === "edited" ? suggestion.final : suggestion.proposal,
  );
  const input = suggestion.input && typeof suggestion.input === "object" && !Array.isArray(suggestion.input)
    ? suggestion.input : null;
  const summaryUnits = input?.units === "kg" || input?.units === "lb" ? input.units : units;
  const status = suggestion.status;
  return <main className="mx-auto max-w-3xl">
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">Athlete account change</h1>
      <p className="mt-1 text-muted-foreground">{athleteName}</p>
      <Badge className="mt-3 capitalize" variant={status === "failed" ? "destructive" : status === "pending" ? "secondary" : "outline"}>{status}</Badge>
    </div>
    <Card>
      <CardHeader><CardTitle>Before → After</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {parsed.success ? <ul className="grid gap-3">
          {accountChangeSummaryLines(parsed.data.change, parsed.data.before, summaryUnits).map((line, index) => (
            <li key={index} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
              <span className="font-medium">{line.label}</span>
              <span>{line.before} → {line.after}</span>
            </li>
          ))}
        </ul> : <p className="text-sm text-muted-foreground">The change details are unavailable.</p>}
        {status === "pending" && <div className="flex flex-wrap items-start gap-3">
          <ApproveAccountChangeForm id={suggestion.id} />
          <RejectSuggestionForm id={suggestion.id} />
        </div>}
      </CardContent>
    </Card>
  </main>;
}
