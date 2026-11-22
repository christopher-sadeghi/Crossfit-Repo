import { AssistantRulesForm } from "@/components/assistant-rules-form";
import { AssistantText } from "@/components/assistant-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAthleteAssistantTranscript } from "@/app/(app)/settings/assistant-actions";
import { assistantCards } from "@/lib/ai/assistant-ui";
import { getTimeZone } from "@/lib/time-zone";

export async function AssistantTab({ athleteId, rules }: { athleteId: string; rules: string | null }) {
  const [result, timeZone] = await Promise.all([loadAthleteAssistantTranscript(athleteId), getTimeZone()]);
  return <div className="grid gap-4">
    <Card><CardHeader><CardTitle>Athlete assistant rules</CardTitle></CardHeader><CardContent>
      <AssistantRulesForm athleteId={athleteId} settings={{ assistant_rules: rules, assistant_training: true, assistant_nutrition: true, assistant_recovery: true, athlete_ai_daily_limit: 25 }} />
    </CardContent></Card>
    <Card><CardHeader><CardTitle>AI chat</CardTitle></CardHeader><CardContent>
      <p className="mb-4 text-sm text-muted-foreground">Read-only conversation. Drafts shown here are not proof that a message was sent or an activity saved.</p>
      {"error" in result ? <p role="alert" className="text-sm text-destructive">{result.error}</p>
        : !result.messages.length ? <p className="text-sm text-muted-foreground">No AI chats yet.</p>
        : <ol className="grid gap-4">{result.messages.map((message) => <li key={message.id} className={`min-w-0 rounded-lg border p-4 ${message.red_flag ? "border-destructive bg-destructive/5" : ""}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-semibold">{message.role === "user" ? "Athlete" : "AI assistant"}</span>
            <time dateTime={message.created_at}>{new Intl.DateTimeFormat("en", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(message.created_at))}</time>
          </div>
          {message.red_flag && <p className="mb-2 text-sm font-semibold text-destructive">Safety flag</p>}
          {message.role === "assistant" ? <AssistantText text={message.content} /> : <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>}
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">{assistantCards(message.metadata).map((card, index) => <li key={index}>
            {card.kind === "coach_message" ? "Drafted a message to you" : card.kind === "activity" ? "Drafted an activity" : "Offered today's workout adjustment form"}
          </li>)}</ul>
        </li>)}</ol>}
    </CardContent></Card>
  </div>;
}
