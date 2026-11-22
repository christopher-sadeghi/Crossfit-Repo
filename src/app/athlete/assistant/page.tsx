import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { AssistantChat } from "./assistant-chat";
import type { ChatEntry } from "./use-assistant";

export default async function AthleteAssistantPage() {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") redirect("/athlete");
  const supabase = await createClient();
  const messages: ChatEntry[] = [];
  let failed = false;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("athlete_ai_messages").select("id, role, content, metadata, actions:athlete_ai_card_actions(card_index, action, ref_id)")
      .eq("athlete_id", viewer.athleteId).order("created_at").order("id").range(offset, offset + 499);
    if (error) { failed = true; break; }
    messages.push(...data.map((row) => ({ ...row, role: row.role as ChatEntry["role"] })));
    if (data.length < 500) break;
  }
  return <div className="mx-auto grid w-full max-w-2xl gap-4">
    <h1 className="text-xl font-semibold">Ask AI</h1>
    <div className="rounded-lg border bg-muted p-4 text-sm">
      <p className="font-semibold">Your coach can see this chat.</p>
      <p className="mt-1 text-muted-foreground">It can&apos;t change your programming, macros or goals; it can help you ask your coach.</p>
    </div>
    {failed ? <p role="alert" className="text-sm text-destructive">Couldn&apos;t load your conversation. Please refresh to try again.</p>
      : <AssistantChat initialMessages={messages} athleteId={viewer.athleteId} today={await getToday()} units={viewer.units} />}
  </div>;
}
