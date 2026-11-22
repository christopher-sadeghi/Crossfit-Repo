import { generateText, isStepCount, tool, type LanguageModel, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CHECK_IN_COLUMNS, CHECK_IN_FILTER, checkInAttention, isCheckIn, loadRecentCheckIns } from "@/lib/check-in";
import { addDays } from "@/lib/nutrition";
import { goalProgress } from "@/lib/progress";
import { loadAthleteBenchmarks, loadLiftMaxes } from "@/lib/benchmarks";
import { personalRecords } from "@/lib/results";
import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { fromKgPrecise } from "@/lib/units";
import type { Database, Json } from "@/lib/supabase/database.types";

import { aiDailyLimit, aiLimitMessage, countAiUsageToday, runSuggestionWithClient } from "./service-core";
import { SUGGESTION_REGISTRY } from "./suggestions";
import { formatLiftMaxes, LIFT_LOAD_RULE } from "./lift-context";
import { consistencyContext, trainingLoadContext } from "./athlete-context";

export const chatContextSchema = z.object({
  athleteId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
});
export type ChatContext = z.infer<typeof chatContextSchema>;

export const chatMessageSchema = z.string().trim().min(1).max(2000);

const HISTORY_LIMIT = 20;
const MAX_PROPOSALS_PER_MESSAGE = 6;
const FRIENDLY_ERROR = "The AI coach couldn't answer right now. Please try again in a minute.";

type Supabase = SupabaseClient<Database>;
type Units = "lb" | "kg";

const CHAT_SYSTEM = `You are the programming assistant for a CrossFit coach. You talk to the coach, not to athletes.

Rules:
- Use get_athlete consistency for completion and attendance; mention low completion or drifting and keep plans realistic, treating missing rates as unknown.
- ${LIFT_LOAD_RULE}
- Use the tool outputs' last_7_days average_readiness, latest_readiness and needs_attention, plus recent_check_ins readiness, sleep, soreness areas, stress, energy and mood. Lower readiness or high soreness means scale down and avoid sore areas.
- Only use real data from your tools. Never invent athletes, results, PRs, injuries, goals or workouts. If data is missing, say so.
- Look data up before answering questions about athletes, programs or workouts.
- Only use movements from the coach's movement library (listed below). Never suggest other movements.
- You cannot change any data. To write or change programming, call a propose_* tool. Each call creates one pending suggestion that the coach must review and approve in the AI Suggestions inbox. Nothing changes until they approve.
- Only propose changes when the coach asks for programming or changes. For questions (for example "Who is overtraining this week?"), just answer.
- To plan several days for one athlete, call propose_workout once per training day with athlete_id and scheduled_on. At most ${MAX_PROPOSALS_PER_MESSAGE} proposals per message; if more are needed, propose the first ones and offer to continue.
- To make an existing WOD easier or safer for one athlete, use propose_scaling if available.
- Respect injuries and recent pain notes: work around them and say how.
- Signs of overtraining or under-recovery: high RPE (8+), low energy (1–2 of 5), short sleep (under 6h), high soreness (4–5 of 5), pain notes, or many sessions in a few days.
- Explain your reasoning in plain English, in short paragraphs or bullets. No jargon, no JSON, no IDs.
- After proposing, tell the coach what you proposed and that it is waiting for their approval in AI Suggestions.
- Weights are in <units>. Today is <today>.`;

function resolveModel(model?: LanguageModel) {
  if (model) return model;
  if (!process.env.OPENAI_API_KEY) return null;
  return openai(process.env.OPENAI_CHAT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini");
}

const average = (values: (number | null)[]) => {
  const present = values.filter((v): v is number => v != null).map(Number);
  return present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10 : null;
};

const load = (kg: number | null, units: Units) => (kg == null ? null : fromKgPrecise(Number(kg), units));

async function listAthletes(supabase: Supabase, today: string) {
  const since = addDays(today, -6);
  const [{ data: athletes, error }, { data: results, error: resultsError }, { data: journal, error: journalError }] =
    await Promise.all([
      supabase
        .from("athletes")
        .select("id, first_name, last_name, experience_level, injuries, status, goals(title, status)")
        .order("first_name"),
      supabase
        .from("workout_results")
        .select("athlete_id, performed_on, rpe, energy, sleep_hours, soreness, pain_notes")
        .gte("performed_on", since)
        .lte("performed_on", today),
      supabase
        .from("athlete_journal_entries")
        .select(CHECK_IN_COLUMNS)
        .or(CHECK_IN_FILTER)
        .gte("entry_on", since)
        .lte("entry_on", today)
        .order("entry_on", { ascending: false }),
    ]);
  if (error) throw error;
  if (resultsError) throw resultsError;
  if (journalError) throw journalError;
  return (athletes ?? []).map((athlete) => {
    const week = (results ?? []).filter((r) => r.athlete_id === athlete.id);
    const days = (journal ?? []).filter((j) => j.athlete_id === athlete.id && isCheckIn(j));
    // One sleep value per night: the journal entry if there is one, otherwise the first result that day.
    const sleepByNight = new Map<string, number | null>();
    for (const entry of days) {
      if (entry.sleep_hours != null) sleepByNight.set(entry.entry_on, entry.sleep_hours);
    }
    for (const result of week) {
      if (result.sleep_hours != null && !sleepByNight.has(result.performed_on)) {
        sleepByNight.set(result.performed_on, result.sleep_hours);
      }
    }
    const soreness = [...week, ...days].flatMap((entry) => entry.soreness == null ? [] : [entry.soreness]);
    const attention = checkInAttention(days, today);
    return {
      athlete_id: athlete.id,
      name: `${athlete.first_name} ${athlete.last_name}`,
      status: athlete.status,
      experience_level: athlete.experience_level,
      injuries: athlete.injuries,
      active_goals: athlete.goals.filter((g) => g.status === "active").map((g) => g.title),
      last_7_days: {
        sessions: week.length,
        average_rpe: average(week.map((r) => r.rpe)),
        max_rpe: week.length ? Math.max(...week.map((r) => r.rpe ?? 0)) || null : null,
        average_energy: average(week.map((r) => r.energy)),
        average_sleep_hours: average([...sleepByNight.values()]),
        max_soreness: soreness.length ? Math.max(...soreness) : null,
        average_readiness: average(days.map((j) => j.readiness)),
        latest_readiness: days.find((entry) => entry.readiness != null)?.readiness ?? null,
        needs_attention: attention.flagged,
        attention_reasons: attention.reasons,
        pain_notes: week.filter((r) => r.pain_notes).map((r) => `${r.performed_on}: ${r.pain_notes}`),
        high_stress_days: days.filter((j) => (j.stress ?? 0) >= 4).length,
      },
    };
  });
}

async function getAthlete(supabase: Supabase, athleteId: string, today: string, units: Units) {
  const [
    benchmarks,
    liftMaxes,
    { data: athlete, error },
    { data: metrics },
    { data: goals },
    { data: results },
    { data: journal },
    recentCheckIns,
    consistency,
    trainingLoad,
  ] = await Promise.all([
    loadAthleteBenchmarks(supabase, athleteId, today),
    loadLiftMaxes(supabase, athleteId),
    supabase
      .from("athletes")
      .select("id, first_name, last_name, experience_level, injuries, notes, status, sex, birth_date")
      .eq("id", athleteId)
      .maybeSingle(),
    supabase
      .from("body_metrics")
      .select("measured_on, weight_kg, body_fat_pct")
      .eq("athlete_id", athleteId)
      .order("measured_on", { ascending: false })
      .limit(10),
    supabase
      .from("goals")
      .select("title, goal_type, metric, unit, movement_id, start_value, target_value, target_date, status, movements(name)")
      .eq("athlete_id", athleteId),
    supabase
      .from("workout_results")
      .select(
        "performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, rpe, energy, sleep_hours, soreness, pain_notes, workouts(title, workout_type, workout_movements(movement_id))",
      )
      .eq("athlete_id", athleteId)
      .order("performed_on", { ascending: false }),
    supabase
      .from("athlete_journal_entries")
      .select("entry_on, alcohol, late_caffeine, hit_water_goal, late_meal, screens_in_bed, mobility")
      .eq("athlete_id", athleteId)
      .gte("entry_on", addDays(today, -13))
      .lte("entry_on", today)
      .order("entry_on", { ascending: false }),
    loadRecentCheckIns(supabase, athleteId, today, 7),
    consistencyContext(supabase, athleteId, today),
    trainingLoadContext(supabase, athleteId, today),
  ]);
  if (error) throw error;
  if (!athlete) return { error: "Athlete not found." };

  const schedule = await loadAthleteSchedule(
    supabase,
    athleteId,
    { from: addDays(today, -7), to: addDays(today, 14) },
    "id, source_workout_id, title, week_number, day_number, workout_type",
  );
  const allResults = results ?? [];
  const goalData = { metrics: metrics ?? [], results: allResults, liftMaxes };
  const kgValue = (value: number | null, unit: string | null) => (unit === "kg" ? load(value, units) : value);

  return {
    recent_check_ins: recentCheckIns,
    consistency,
    training_load: trainingLoad,
    lift_maxes: formatLiftMaxes(liftMaxes, units),
    benchmark_bests: benchmarks.flatMap((b) => b.best ? [{
      name: b.name, workout_type: b.workout_type, date: b.best.performed_on,
      time_seconds: b.best.time_seconds, rounds: b.best.rounds, reps: b.best.reps,
      load: load(b.best.load_kg, units), units, rep_max: b.best.rep_max, rx: b.best.is_rx,
    }] : []),
    athlete_id: athlete.id,
    name: `${athlete.first_name} ${athlete.last_name}`,
    experience_level: athlete.experience_level,
    injuries: athlete.injuries,
    coach_notes: athlete.notes,
    status: athlete.status,
    sex: athlete.sex,
    birth_date: athlete.birth_date,
    latest_body_metrics: metrics?.[0]
      ? { ...metrics[0], weight: load(metrics[0].weight_kg, units), weight_kg: undefined }
      : null,
    goals: (goals ?? []).map((goal) => {
      const progress = goalProgress(goal, goalData);
      const unit = goal.unit === "kg" ? units : goal.unit;
      return {
        title: goal.title,
        status: goal.status,
        movement: goal.movements?.name ?? null,
        metric: goal.metric,
        unit,
        start: kgValue(goal.start_value, goal.unit),
        target: kgValue(goal.target_value, goal.unit),
        current: kgValue(progress.current, goal.unit),
        percent_complete: progress.pct,
        target_date: goal.target_date,
      };
    }),
    personal_records: personalRecords(allResults)
      .slice(0, 15)
      .map((pr) => ({
        workout: pr.workouts?.title,
        performed_on: pr.performed_on,
        time_seconds: pr.time_seconds,
        rounds: pr.rounds,
        reps: pr.reps,
        load: load(pr.load_kg, units),
        rx: pr.is_rx,
        attempts: pr.attempts,
      })),
    recent_results: allResults.slice(0, 15).map((r) => ({
      performed_on: r.performed_on,
      workout: r.workouts?.title,
      time_seconds: r.time_seconds,
      rounds: r.rounds,
      reps: r.reps,
      load: load(r.load_kg, units),
      rx: r.is_rx,
      notes: r.notes,
      rpe: r.rpe,
      energy_1_to_5: r.energy,
      sleep_hours: r.sleep_hours,
      soreness_1_to_5: r.soreness,
      pain_notes: r.pain_notes,
    })),
    journal_last_14_days: journal ?? [],
    schedule_last_7_and_next_14_days: schedule.map((item) => ({
      date: item.date,
      workout_id: item.workout.id,
      title: item.workout.title,
      source: item.source,
      program: item.programName,
    })),
  };
}

async function listPrograms(supabase: Supabase) {
  const { data, error } = await supabase
    .from("programs")
    .select("id, name, description, weeks, athlete_id, program_assignments(start_date, athletes(first_name, last_name))")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    program_id: p.id,
    name: p.name,
    description: p.description,
    weeks: p.weeks,
    personal_program: Boolean(p.athlete_id),
    assigned: p.program_assignments.map((a) => ({
      athlete: a.athletes ? `${a.athletes.first_name} ${a.athletes.last_name}` : null,
      start_date: a.start_date,
    })),
  }));
}

const WORKOUT_DETAIL =
  "id, title, workout_type, time_cap_seconds, rounds, description, notes, week_number, day_number, scheduled_on, workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(name))";

type WorkoutDetailRow = {
  id: string;
  title: string;
  workout_type: string;
  time_cap_seconds: number | null;
  rounds: number | null;
  description: string | null;
  notes: string | null;
  week_number: number | null;
  day_number: number | null;
  scheduled_on: string | null;
  workout_movements: {
    position: number;
    sets: number | null;
    reps: number | null;
    load_kg: number | null;
    distance_m: number | null;
    calories: number | null;
    duration_seconds: number | null;
    notes: string | null;
    movements: { name: string } | null;
  }[];
};

const workoutDetail = (w: WorkoutDetailRow, units: Units) => ({
  workout_id: w.id,
  title: w.title,
  workout_type: w.workout_type,
  time_cap_seconds: w.time_cap_seconds,
  rounds: w.rounds,
  description: w.description,
  notes: w.notes,
  week: w.week_number,
  day: w.day_number,
  scheduled_on: w.scheduled_on,
  movements: [...w.workout_movements]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      name: m.movements?.name,
      sets: m.sets,
      reps: m.reps,
      load: load(m.load_kg, units),
      distance_m: m.distance_m,
      calories: m.calories,
      duration_seconds: m.duration_seconds,
      notes: m.notes,
    })),
});

async function getProgram(supabase: Supabase, programId: string, units: Units) {
  const [{ data: program, error }, { data: workouts, error: workoutsError }] = await Promise.all([
    supabase.from("programs").select("id, name, description, weeks, athlete_id").eq("id", programId).maybeSingle(),
    supabase
      .from("workouts")
      .select(WORKOUT_DETAIL)
      .eq("program_id", programId)
      .order("week_number")
      .order("day_number")
      .returns<WorkoutDetailRow[]>(),
  ]);
  if (error) throw error;
  if (workoutsError) throw workoutsError;
  if (!program) return { error: "Program not found." };
  return { ...program, workouts: (workouts ?? []).map((w) => workoutDetail(w, units)) };
}

async function getWorkout(supabase: Supabase, workoutId: string, units: Units) {
  const { data, error } = await supabase
    .from("workouts")
    .select(WORKOUT_DETAIL)
    .eq("id", workoutId)
    .returns<WorkoutDetailRow[]>()
    .maybeSingle();
  if (error) throw error;
  return data ? workoutDetail(data, units) : { error: "Workout not found." };
}

async function contextNote(supabase: Supabase, context: ChatContext) {
  if (context.athleteId) {
    const { data } = await supabase.from("athletes").select("first_name, last_name").eq("id", context.athleteId).maybeSingle();
    if (data)
      return `The coach is looking at ${data.first_name} ${data.last_name}'s page (athlete_id ${context.athleteId}). "She", "he", "they" or "this athlete" means this athlete.`;
  }
  if (context.programId) {
    const { data } = await supabase.from("programs").select("name").eq("id", context.programId).maybeSingle();
    if (data) return `The coach is looking at the program "${data.name}" (program_id ${context.programId}). "This program" means it.`;
  }
  return null;
}

type ChatOptions = {
  message: string;
  context: ChatContext;
  today: string;
  model?: LanguageModel;
};

export type ChatResult = { reply: string; suggestionIds: string[] } | { error: string };

export async function runChatWithClient(supabase: Supabase, opts: ChatOptions): Promise<ChatResult> {
  const limit = aiDailyLimit();
  const usage = await countAiUsageToday(supabase);
  if (usage.error) {
    console.error("AI chat usage check failed:", usage.error);
    return { error: FRIENDLY_ERROR };
  }
  if (usage.count >= limit) return { error: aiLimitMessage(limit) };

  const model = resolveModel(opts.model);
  if (!model) {
    console.error("AI chat failed: OPENAI_API_KEY is missing.");
    return { error: FRIENDLY_ERROR };
  }

  const [{ data: coach }, { data: library, error: libraryError }, { data: history, error: historyError }] = await Promise.all([
    supabase.from("coaches").select("units").maybeSingle(),
    supabase.from("movements").select("name, category").order("name"),
    supabase
      .from("ai_chat_messages")
      .select("role, content")
      .eq("cleared", false)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  if (libraryError || historyError) {
    console.error("AI chat context failed:", libraryError ?? historyError);
    return { error: FRIENDLY_ERROR };
  }
  const units: Units = coach?.units ?? "lb";

  const { data: userMessage, error: insertError } = await supabase
    .from("ai_chat_messages")
    .insert({ role: "user", content: opts.message, context: opts.context as Json })
    .select("id")
    .single();
  if (insertError || !userMessage) {
    console.error("AI chat message could not be saved:", insertError);
    return { error: FRIENDLY_ERROR };
  }
  const reserved = await countAiUsageToday(supabase);
  if (!reserved.error && reserved.count > limit) {
    await supabase.from("ai_chat_messages").update({ cleared: true }).eq("id", userMessage.id);
    return { error: aiLimitMessage(limit) };
  }

  const suggestionIds: string[] = [];
  const proposalErrors: string[] = [];
  let proposalCount = 0;

  async function propose(type: "write_workout" | "scale_workout", params: Parameters<NonNullable<(typeof SUGGESTION_REGISTRY)["write_workout"]["buildRequest"]>>[1]) {
    if (proposalCount >= MAX_PROPOSALS_PER_MESSAGE)
      return { error: `Limit of ${MAX_PROPOSALS_PER_MESSAGE} proposals per message reached.` };
    proposalCount++;
    const entry = SUGGESTION_REGISTRY[type];
    if (!entry.buildRequest) return { error: "This kind of suggestion isn't available yet." };
    try {
      const request = await entry.buildRequest(supabase, params);
      const result = await runSuggestionWithClient(supabase, {
        type,
        athleteId: params.athleteId,
        ...request,
        schema: entry.proposalSchema,
        generationSchema: request.schema,
        validate: entry.validate,
      });
      if ("error" in result) {
        proposalErrors.push(result.error);
        return { error: result.error };
      }
      suggestionIds.push(result.id);
      return { status: "pending_coach_approval", suggestion_id: result.id };
    } catch (error) {
      console.error("AI chat proposal failed:", error);
      proposalCount--;
      return {
        error:
          "That suggestion couldn't be created. Check that workout_id is a WOD id (from get_program or get_workout) and athlete_id is an athlete id, then try again.",
      };
    }
  }

  const safe =
    <I, O>(fn: (input: I) => Promise<O>) =>
    async (input: I) => {
      try {
        return await fn(input);
      } catch (error) {
        console.error("AI chat tool failed:", error);
        return { error: "Could not load that data." };
      }
    };

  const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const tools = {
    list_athletes: tool({
      description:
        "All of the coach's athletes with experience level, injuries, active goals and last-7-day training load and recovery (RPE, energy, sleep, soreness, pain). Use for team-wide questions like who is overtraining.",
      inputSchema: z.object({}),
      execute: safe(async () => listAthletes(supabase, opts.today)),
    }),
    get_athlete: tool({
      description:
        "Full detail for one athlete: profile, injuries, goals and progress, PRs, recent results and outside activities, gym and outside training load, consistency (completion, streaks, attendance and drifting), recovery journal, and schedule for the last 7 and next 14 days.",
      inputSchema: z.object({ athlete_id: z.string().uuid() }),
      execute: safe(async ({ athlete_id }: { athlete_id: string }) => getAthlete(supabase, athlete_id, opts.today, units)),
    }),
    list_programs: tool({
      description: "The coach's programs with who is assigned and when they started.",
      inputSchema: z.object({}),
      execute: safe(async () => listPrograms(supabase)),
    }),
    get_program: tool({
      description: "One program with all of its workouts and movements.",
      inputSchema: z.object({ program_id: z.string().uuid() }),
      execute: safe(async ({ program_id }: { program_id: string }) => getProgram(supabase, program_id, units)),
    }),
    get_workout: tool({
      description: "One workout with its movements.",
      inputSchema: z.object({ workout_id: z.string().uuid() }),
      execute: safe(async ({ workout_id }: { workout_id: string }) => getWorkout(supabase, workout_id, units)),
    }),
    propose_workout: tool({
      description:
        "Create a pending suggestion for a new or changed WOD. The coach must approve it before anything changes. Pass workout_id to adjust an existing workout. Pass athlete_id and scheduled_on to write a one-off WOD for that athlete on that date (individual programming). Pass neither to write a WOD for the coach's library.",
      inputSchema: z.object({
        request: z
          .string()
          .min(3)
          .max(1500)
          .describe("Detailed instructions for the WOD writer: goal, focus, intensity, what to avoid and why."),
        workout_id: z.string().uuid().optional(),
        athlete_id: z.string().uuid().optional(),
        scheduled_on: dateSchema.optional(),
      }),
      execute: async ({ request, workout_id, athlete_id, scheduled_on }) => {
        if (athlete_id && !scheduled_on) return { error: "scheduled_on is required with athlete_id." };
        if (workout_id && athlete_id) return { error: "Use either workout_id or athlete_id, not both." };
        return propose("write_workout", {
          athleteId: athlete_id ?? null,
          workoutId: workout_id ?? null,
          scheduledOn: scheduled_on ?? null,
          request,
        });
      },
    }),
    ...(SUGGESTION_REGISTRY.scale_workout.buildRequest
      ? {
          propose_scaling: tool({
            description:
              "Create a pending suggestion to scale one existing WOD for one athlete (loads, reps, movement swaps). The coach must approve it before anything changes.",
            inputSchema: z.object({
              athlete_id: z.string().uuid(),
              workout_id: z.string().uuid(),
              note: z.string().max(300).optional().describe("Why and how to scale, e.g. knee pain, keep it low impact."),
            }),
            execute: async ({ athlete_id, workout_id, note }: { athlete_id: string; workout_id: string; note?: string }) =>
              propose("scale_workout", { athleteId: athlete_id, workoutId: workout_id, request: note ?? null }),
          }),
        }
      : {}),
  };

  const priorMessages: ModelMessage[] = (history ?? [])
    .reverse()
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }) as ModelMessage);
  const note = await contextNote(supabase, opts.context);
  const system = [
    CHAT_SYSTEM.replace("<units>", units).replace("<today>", opts.today),
    note,
    `Movement library (${library?.length ?? 0}): ${(library ?? []).map((m) => `${m.name} (${m.category})`).join(", ") || "empty"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let reply: string;
  try {
    const result = await generateText({
      model,
      system,
      messages: [...priorMessages, { role: "user", content: opts.message }],
      tools,
      stopWhen: isStepCount(10),
      timeout: 120_000,
      maxRetries: 1,
      providerOptions: { openai: { reasoningEffort: "low" } },
    });
    reply = result.text.trim();
  } catch (error) {
    console.error("AI chat failed:", error);
    if (!suggestionIds.length) return { error: FRIENDLY_ERROR };
    reply = "";
  }
  if (!reply)
    reply = suggestionIds.length
      ? "I created suggestions for you to review. Nothing changes until you approve them."
      : proposalErrors[0] ?? "Sorry, I don't have an answer for that. Try asking another way.";

  const { error: saveError } = await supabase
    .from("ai_chat_messages")
    .insert({ role: "assistant", content: reply.slice(0, 8000), suggestion_ids: suggestionIds, context: opts.context as Json });
  if (saveError) console.error("AI chat reply could not be saved:", saveError);
  return { reply, suggestionIds };
}
