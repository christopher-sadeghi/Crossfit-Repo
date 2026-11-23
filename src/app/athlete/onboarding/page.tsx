import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { cmToFtIn } from "@/lib/height";
import { fromKg } from "@/lib/units";
import { getToday } from "@/lib/time-zone";
import { goalPrefill, injuryPrefill } from "@/lib/athlete-intake";
import { IntakeForm } from "./intake-form";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") redirect("/login");
  const db = await createClient();
  const [intake, athlete, preferences, metrics, goals, results, benchmarks] = await Promise.all([
    db.from("athlete_intakes").select("*").eq("athlete_id", viewer.athleteId).maybeSingle(),
    db.from("athletes").select("*").eq("id", viewer.athleteId).single(),
    db.from("athlete_food_preferences").select("*").eq("athlete_id", viewer.athleteId).maybeSingle(),
    db.from("body_metrics").select("weight_kg").eq("athlete_id", viewer.athleteId).lte("measured_on", await getToday()).order("measured_on", { ascending: false }).order("created_at", { ascending: false }).limit(1),
    db.from("goals").select("*").eq("athlete_id", viewer.athleteId),
    db.from("benchmark_results").select("*").eq("athlete_id", viewer.athleteId),
    db.from("benchmarks").select("id, name, kind, workout_type").order("name"),
  ]);
  for (const r of [intake, athlete, preferences, metrics, goals, results, benchmarks]) if (r.error) throw new Error("Couldn't load your questionnaire. Please try again.");
  if (!intake.data || intake.data.status === "completed") redirect("/athlete");
  const answers = intake.data.answers as Record<string, unknown>;
  const height = cmToFtIn(athlete.data?.height_cm);
  const selectedGoals = (goals.data ?? []).filter((g) => Array.isArray(answers.goal_ids) && answers.goal_ids.includes(g.id));
  const selectedResults = (results.data ?? []).filter((r) => Array.isArray(answers.benchmark_result_ids) && answers.benchmark_result_ids.includes(r.id));
  const requestedStep = Number((await searchParams).step);
  const step = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= intake.data.current_step ? requestedStep : intake.data.current_step;
  const weight = metrics.data?.[0]?.weight_kg;
  const values = {
    ...answers, birth_date: athlete.data?.birth_date ?? "", sex: athlete.data?.sex ?? "", height_ft: height?.ft ?? "", height_in: height?.in ?? "", weight: weight == null ? "" : fromKg(weight, viewer.units),
    experience_level: athlete.data?.experience_level ?? "beginner", years_training: answers.years_training ?? "", crossfit_detail: answers.crossfit_detail ?? "", sports_background: answers.sports_background ?? "",
    benchmarks: selectedResults.map((r) => ({ benchmark_id: r.benchmark_id, load: r.load_kg == null ? "" : fromKg(r.load_kg, viewer.units), time_seconds: r.time_seconds ?? "", rounds: r.rounds ?? "", reps: r.reps ?? "" })),
    goals: selectedGoals.map((g) => goalPrefill(g, (answers.goal_categories as Record<string, unknown> | undefined)?.[g.id])),
    ...injuryPrefill(answers, athlete.data?.injuries), days_per_week: answers.days_per_week ?? "", session_minutes: answers.session_minutes ?? "", location: answers.location ?? "gym", equipment: answers.equipment ?? [],
    diet_type: preferences.data?.diet_type ?? "none", allergies: preferences.data?.allergies.join(", ") ?? "", dislikes: preferences.data?.dislikes.join(", ") ?? "", cooking_minutes: preferences.data?.cooking_minutes == null ? "" : String(preferences.data.cooking_minutes), eating_habits: answers.eating_habits ?? "",
    sleep_hours: answers.sleep_hours ?? "", stress_level: answers.stress_level ?? "moderate", job_activity: answers.job_activity ?? "sedentary",
    health_screening: answers.health_screening ?? {
      surgery_details: "", medications: "", conditions: "",
      emergency_contact: { name: "", phone: "", relationship: "" },
    },
  };
  return <IntakeForm key={step} step={step} values={values} benchmarks={benchmarks.data ?? []} units={viewer.units} />;
}
