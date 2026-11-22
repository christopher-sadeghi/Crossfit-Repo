import { z } from "zod";
import { streamAthleteAssistant } from "@/lib/ai/athlete-assistant";
import { assistantMessageSchema } from "@/lib/ai/assistant-schema";
import { FRIENDLY_ERROR } from "@/lib/ai/chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getToday, getTimeZone } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export const maxDuration = 90;

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return Response.json({ error: "Sign in as an athlete to ask AI." }, { status: 403 });
  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > 16000) return Response.json({ error: "Your message is too long." }, { status: 400 });
    input = JSON.parse(text);
  } catch {
    return Response.json({ error: "Send a valid message." }, { status: 400 });
  }
  const parsed = z.object({ message: assistantMessageSchema }).strict().safeParse(input);
  if (!parsed.success) return Response.json({ error: "Enter a message between 1 and 2000 characters." }, { status: 400 });
  try {
    const [supabase, today, timeZone] = await Promise.all([createClient(), getToday(), getTimeZone()]);
    const assistantWriter = createAdminClient();
    return await streamAthleteAssistant(supabase, viewer, parsed.data.message, today, timeZone, assistantWriter);
  } catch {
    return Response.json({ error: FRIENDLY_ERROR }, { status: 503 });
  }
}
