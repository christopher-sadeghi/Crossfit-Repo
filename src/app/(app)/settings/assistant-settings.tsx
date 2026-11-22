import { AssistantRulesForm } from "@/components/assistant-rules-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COACH_SESSION_ERROR } from "@/lib/ai/coach-session";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function AssistantSettings() {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return <p role="alert">{COACH_SESSION_ERROR}</p>;
  if (viewer.role !== "owner") return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("coaches")
    .select("assistant_rules, assistant_training, assistant_nutrition, assistant_recovery, athlete_ai_daily_limit").eq("id", viewer.gymId).single();
  return <Card className="mt-6">
    <CardHeader><CardTitle>Athlete AI assistant</CardTitle></CardHeader>
    <CardContent>{error || !data ? <p role="alert" className="text-sm text-destructive">Couldn&apos;t load assistant settings. Please refresh.</p>
      : <AssistantRulesForm settings={data} />}</CardContent>
  </Card>;
}
