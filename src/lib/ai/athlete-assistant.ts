import { isStepCount, streamText, tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { notify } from "@/lib/notifications";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { AthleteViewer } from "@/lib/viewer";
import { extractActivityDraft } from "./activity-extraction";
import { getMyTraining } from "./assistant-context";
import { assistantDayBounds, assistantLimitReached } from "./assistant-limit";
import { buildAssistantPrompt, defaultAssistantSettings } from "./assistant-prompt";
import { assistantSafety } from "./assistant-safety";
import { assistantCardSchema, coachMessageDraftSchema, type AssistantCard } from "./assistant-schema";
import { FRIENDLY_ERROR, resolveModel } from "./chat";
import { aiLimitMessage } from "./service-core";

type Client = SupabaseClient<Database>;
const jsonError = (error: string, status: number) => Response.json({ error }, { status });

export async function streamAthleteAssistant(supabase: Client, viewer: AthleteViewer, message: string, today: string, timeZone: string, injectedModel?: LanguageModel) {
  const safety = assistantSafety(message);
  if (safety.flagged) {
    await notify(supabase, { athleteId: viewer.athleteId, kind: "assistant_red_flag",
      title: "Safety concern in athlete AI chat", body: message.slice(0, 500),
      link: `/athletes/${viewer.athleteId}?tab=assistant`, dedupeKey: `assistant-red-flag:${viewer.athleteId}:${today}` }).catch(() => {});
  }
  const { data: rows, error: settingsError } = await supabase.rpc("athlete_assistant_settings");
  if (settingsError) return jsonError(FRIENDLY_ERROR, 503);
  const settings = rows?.[0];
  if (!settings) return jsonError("Your active athlete profile could not be found.", 403);
  const config = { ...defaultAssistantSettings, ...settings };
  const bounds = assistantDayBounds(today, timeZone);
  const countToday = () => supabase.from("athlete_ai_messages").select("id", { count: "exact", head: true })
    .eq("athlete_id", viewer.athleteId).eq("role", "user").gte("created_at", bounds.start).lt("created_at", bounds.end);
  const usage = await countToday();
  if (usage.error) return jsonError(FRIENDLY_ERROR, 503);
  if (assistantLimitReached(usage.count ?? 0, config.athlete_ai_daily_limit))
    return jsonError(aiLimitMessage(config.athlete_ai_daily_limit), 429);
  const model = resolveModel(injectedModel);
  if (!model) return jsonError(FRIENDLY_ERROR, 503);
  const history = await supabase.from("athlete_ai_messages").select("role, content")
    .eq("athlete_id", viewer.athleteId).order("created_at", { ascending: false }).limit(20);
  if (history.error) return jsonError(FRIENDLY_ERROR, 503);
  const reserved = await supabase.from("athlete_ai_messages").insert({
    athlete_id: viewer.athleteId, coach_id: viewer.coachId, role: "user", content: message, red_flag: safety.flagged,
  }).select("id").single();
  if (reserved.error || !reserved.data) return jsonError(FRIENDLY_ERROR, 503);
  const rechecked = await countToday();
  if (rechecked.error) return jsonError(FRIENDLY_ERROR, 503);
  if (assistantLimitReached(rechecked.count ?? 0, config.athlete_ai_daily_limit, true))
    return jsonError(aiLimitMessage(config.athlete_ai_daily_limit), 429);
  const cards: AssistantCard[] = [];
  const addCard = (value: AssistantCard) => {
    const card = assistantCardSchema.parse(value);
    if (cards.length >= 6) return { error: "There are already six drafts. Confirm one before asking for more." };
    cards.push(card);
    return card;
  };
  let saved: Promise<void> | undefined;
  const assistantMessageId = crypto.randomUUID();
  const persist = (text: string) => saved ??= (async () => {
    const result = await supabase.from("athlete_ai_messages").insert({
      id: assistantMessageId,
      athlete_id: viewer.athleteId, coach_id: viewer.coachId, role: "assistant",
      content: (text.trim() || (cards.length ? "Here are your drafts. Nothing has been sent, saved or changed." : FRIENDLY_ERROR)).slice(0, 8000),
      metadata: { cards, source_message_id: reserved.data.id } as unknown as Json,
      red_flag: safety.flagged,
    });
    if (result.error) throw new Error("The assistant reply could not be saved.");
  })();
  const unavailableTopic = { error: "Ask your coach about this topic. I can draft a message for you." };
  const tools = {
    get_my_training: tool({
      description: "Look up my profile, goals/progress, today's WOD/personal versions/scalings, results, check-ins, benchmarks/lift maxes, nutrition/preferences, intake and training load.",
      inputSchema: z.object({}).strict(),
      execute: async () => {
        const context = await getMyTraining(supabase, viewer, today);
        return {
          ...context,
          ...(!config.assistant_nutrition ? { current_macros: null, food_preferences: null } : {}),
        };
      },
    }),
    find_movement: tool({
      description: "Find a movement by name and its athlete demo page.",
      inputSchema: z.object({ name: z.string().trim().min(1).max(100) }).strict(),
      execute: async ({ name }) => {
        if (!config.assistant_training || safety.flagged) return unavailableTopic;
        const term = name.replace(/[%_,()]/g, "").trim();
        if (!term) return { movements: [] };
        const { data, error } = await supabase.from("movements").select("id, name, demo_video_url")
          .ilike("name", `%${term}%`).order("name").limit(8);
        if (error) throw error;
        const ids = (data ?? []).map((row) => row.id);
        const guides = ids.length ? await supabase.from("movement_guides").select("movement_id, video_url, clip_path, cues")
          .eq("coach_id", viewer.coachId).in("movement_id", ids) : { data: [], error: null };
        if (guides.error) throw guides.error;
        return { movements: (data ?? []).map((row) => {
          const guide = guides.data?.find((item) => item.movement_id === row.id);
          return { name: row.name, hasDemo: !!(row.demo_video_url || guide?.video_url || guide?.clip_path || guide?.cues.length), href: `/athlete/movements/${row.id}` };
        }) };
      },
    }),
    adjust_todays_wod: tool({
      description: "Offer a handoff to today's existing FIT-22 adjustment form. Does not apply anything.",
      inputSchema: z.object({}).strict(),
      execute: async () => {
        if (!config.assistant_training || safety.flagged) return unavailableTopic;
        const schedule = await loadAthleteSchedule(supabase, viewer.athleteId, { from: today, to: today },
          "id, source_workout_id, title, week_number, day_number");
        const wod = schedule.find((item) => !item.removed && item.date === today);
        return wod ? addCard({ kind: "adjust_wod", workoutId: wod.workout.id }) : { error: "There is no WOD scheduled today. Ask your coach." };
      },
    }),
    draft_coach_message: tool({
      description: "Draft a coach message, not send it. Include change only for a clear structured programming/macros request.",
      inputSchema: coachMessageDraftSchema.omit({ kind: true }),
      execute: async (draft) => {
        const changeAllowed = draft.change?.type === "adjust_macros" ? config.assistant_nutrition : config.assistant_training;
        return addCard({ kind: "coach_message", ...draft, ...(safety.flagged || !changeAllowed ? { change: undefined } : {}) });
      },
    }),
    draft_activity: tool({
      description: "Extract a completed outside activity into an unsaved draft. Never save an activity.",
      inputSchema: z.object({ description: z.string().trim().min(1).max(1000) }).strict(),
      execute: async ({ description }) => {
        if (!config.assistant_training || safety.flagged) return unavailableTopic;
        return addCard({ kind: "activity", draft: await extractActivityDraft(description, today, viewer.units, model) });
      },
    }),
  };
  try {
    const result = streamText({
      model, system: buildAssistantPrompt(config, today, safety),
      messages: [...(history.data ?? []).reverse().map((row) => ({ role: row.role as "user" | "assistant", content: row.content })), { role: "user", content: message }],
      tools, stopWhen: isStepCount(6), maxOutputTokens: 1800,
      timeout: 60_000, maxRetries: 1,
      onFinish: async ({ steps }) => { await persist(steps.map((step) => step.text).filter(Boolean).join("\n\n")); },
      onError: async () => { await persist(FRIENDLY_ERROR).catch(console.error); },
      onAbort: async () => { await persist(FRIENDLY_ERROR).catch(console.error); },
    });
    return result.toUIMessageStreamResponse({
      sendReasoning: false,
      onError: () => FRIENDLY_ERROR,
      messageMetadata: ({ part }) => part.type === "finish" ? { cards, assistantMessageId } : undefined,
      consumeSseStream: async ({ stream }) => {
        const reader = stream.getReader();
        try { while (!(await reader.read()).done) {} } finally { reader.releaseLock(); }
      },
    });
  } catch {
    await persist(FRIENDLY_ERROR).catch(console.error);
    return jsonError(FRIENDLY_ERROR, 503);
  }
}
