import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCoach } from "@/lib/coach";
import { cookingLabel, DIET_LABELS, readPreferences } from "@/lib/food-preferences";
import { formatScore, formatWeight, type Units } from "@/lib/units";
import { RequestIntakeAiForm } from "@/components/suggestions/request-forms";

async function requestIntake(athleteId: string) {
  "use server";
  const coach = await getCoach();
  if (!coach) throw new Error("Sign in as a coach.");
  const db = await createClient();
  const { data: athlete, error: athleteError } = await db.from("athletes").select("id").eq("id", athleteId).eq("coach_id", coach.id).single();
  if (athleteError || !athlete) throw new Error("Athlete not found.");
  const existing = await db.from("athlete_intakes").select("id").eq("athlete_id", athleteId).maybeSingle();
  if (existing.error) throw new Error("Couldn't load questionnaire.");
  const payload = { status: "requested", requested_at: new Date().toISOString(), completed_at: null };
  const result = existing.data
    ? await db.from("athlete_intakes").update(payload).eq("id", existing.data.id)
    : await db.from("athlete_intakes").insert({ ...payload, athlete_id: athleteId, coach_id: coach.id });
  if (result.error) throw new Error("Couldn't send questionnaire.");
  revalidatePath(`/athletes/${athleteId}`);
  revalidatePath("/athlete", "layout");
}

function display(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.map(display).join("; ") : "None";
  if (typeof value === "object") return Object.entries(value).map(([k, v]) => `${k.replaceAll("_", " ")}: ${display(v)}`).join(" · ");
  return String(value);
}

export async function IntakeTab({ athleteId, units }: { athleteId: string; units: Units }) {
  const db = await createClient();
  const [intake, athlete, prefs, metrics, goals, results] = await Promise.all([
    db.from("athlete_intakes").select("*").eq("athlete_id", athleteId).maybeSingle(),
    db.from("athletes").select("birth_date, sex, height_cm, experience_level, injuries").eq("id", athleteId).single(),
    db.from("athlete_food_preferences").select("*").eq("athlete_id", athleteId).maybeSingle(),
    db.from("body_metrics").select("weight_kg, measured_on").eq("athlete_id", athleteId).order("measured_on", { ascending: false }).order("created_at", { ascending: false }).limit(1),
    db.from("goals").select("id, title, target_value, target_date").eq("athlete_id", athleteId),
    db.from("benchmark_results").select("id, time_seconds, rounds, reps, load_kg, benchmarks(name)").eq("athlete_id", athleteId),
  ]);
  for (const r of [intake, athlete, prefs, metrics, goals, results]) if (r.error) throw new Error("Couldn't load intake.");
  const answers = (intake.data?.answers ?? {}) as Record<string, unknown>;
  const goalCategories = answers.goal_categories && typeof answers.goal_categories === "object" && !Array.isArray(answers.goal_categories)
    ? answers.goal_categories as Record<string, unknown> : {};
  const preferences = readPreferences(prefs.data);
  const details: Record<string, unknown> = {
    "Birth date": athlete.data?.birth_date, Sex: athlete.data?.sex, "Height (cm)": athlete.data?.height_cm,
    "Latest weight": `${formatWeight(metrics.data?.[0]?.weight_kg, units)}${metrics.data?.[0] ? ` (${metrics.data[0].measured_on})` : ""}`,
    "CrossFit level": athlete.data?.experience_level, "Injuries summary": athlete.data?.injuries,
    Diet: DIET_LABELS[preferences.diet_type], Allergies: preferences.allergies, Dislikes: preferences.dislikes, Cooking: cookingLabel(preferences.cooking_minutes),
    ...Object.fromEntries(Object.entries(answers).filter(([key]) => !["goal_ids", "goal_categories", "benchmark_result_ids"].includes(key)).map(([key, value]) => [key.replaceAll("_", " "), value])),
  };
  return <Card><CardHeader><CardTitle>Intake</CardTitle></CardHeader><CardContent className="space-y-5">
    <p>Status: <strong>{intake.data?.status.replaceAll("_", " ") ?? "Not requested"}</strong>{intake.data ? ` · Step ${intake.data.current_step} of 7 · Requested ${new Date(intake.data.requested_at).toLocaleDateString()}` : ""}</p>
    <form action={requestIntake.bind(null, athleteId)}><Button variant="outline">{intake.data ? "Resend" : "Send questionnaire"}</Button></form>
    <p className="text-sm text-muted-foreground">The athlete will see the questionnaire next time they open the portal. Resending keeps their previous answers.</p>
    {intake.data?.status === "completed" && <>
      <p className="text-sm">Completed {intake.data.completed_at ? new Date(intake.data.completed_at).toLocaleDateString() : ""}</p>
      <dl className="grid gap-4 sm:grid-cols-2">{Object.entries(details).map(([label, value]) => <div key={label}><dt className="text-sm font-medium capitalize">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{display(value)}</dd></div>)}</dl>
      <div><h3 className="font-medium">Intake goals</h3>{goals.data?.filter((g) => Array.isArray(answers.goal_ids) && answers.goal_ids.includes(g.id)).map((g) => <p className="text-sm" key={g.id}>{g.title}{typeof goalCategories[g.id] === "string" && !g.title.startsWith(goalCategories[g.id] as string) ? ` · ${goalCategories[g.id]}` : ""}{g.target_value == null ? "" : ` · ${g.target_value}`}{g.target_date ? ` · by ${g.target_date}` : ""}</p>)}</div>
      <div><h3 className="font-medium">Known 1RMs & benchmarks</h3>{results.data?.filter((r) => Array.isArray(answers.benchmark_result_ids) && answers.benchmark_result_ids.includes(r.id)).map((r) => <p className="text-sm" key={r.id}>{r.benchmarks?.name}: {formatScore(r, units)}</p>)}</div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><RequestIntakeAiForm athleteId={athleteId} type="draft_program" label="Draft first 4 weeks" /><RequestIntakeAiForm athleteId={athleteId} type="adjust_macros" label="Suggest starting macros" /></div>
    </>}
  </CardContent></Card>;
}
