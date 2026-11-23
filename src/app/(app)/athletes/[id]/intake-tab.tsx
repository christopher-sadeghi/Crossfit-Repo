import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCoach } from "@/lib/coach";
import { cookingLabel, DIET_LABELS, readPreferences } from "@/lib/food-preferences";
import { formatScore, formatWeight, type Units } from "@/lib/units";
import { RequestIntakeAiForm } from "@/components/suggestions/request-forms";
import { healthFlag, type HealthScreening } from "@/lib/athlete-intake";
import { waiverStatus } from "@/lib/waivers";

async function requestIntake(athleteId: string) {
  "use server";
  const coach = await getCoach();
  if (!coach) throw new Error("Sign in as a coach.");
  const db = await createClient();
  const { data: athlete, error: athleteError } = await db.from("athletes").select("id").eq("id", athleteId).eq("coach_id", coach.gymId).single();
  if (athleteError || !athlete) throw new Error("Athlete not found.");
  const existing = await db.from("athlete_intakes").select("id").eq("athlete_id", athleteId).maybeSingle();
  if (existing.error) throw new Error("Couldn't load questionnaire.");
  const payload = { status: "requested", requested_at: new Date().toISOString(), completed_at: null };
  const result = existing.data
    ? await db.from("athlete_intakes").update(payload).eq("id", existing.data.id)
    : await db.from("athlete_intakes").insert({ ...payload, athlete_id: athleteId, coach_id: coach.gymId });
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
  const coach = await getCoach();
  const [intake, athlete, prefs, metrics, goals, results, waivers, signatures] = await Promise.all([
    db.from("athlete_intakes").select("*").eq("athlete_id", athleteId).maybeSingle(),
    db.from("athletes").select("birth_date, sex, height_cm, experience_level, injuries, waiver_requested_at").eq("id", athleteId).single(),
    db.from("athlete_food_preferences").select("*").eq("athlete_id", athleteId).maybeSingle(),
    db.from("body_metrics").select("weight_kg, measured_on").eq("athlete_id", athleteId).order("measured_on", { ascending: false }).order("created_at", { ascending: false }).limit(1),
    db.from("goals").select("id, title, target_value, target_date").eq("athlete_id", athleteId),
    db.from("benchmark_results").select("id, time_seconds, rounds, reps, load_kg, benchmarks(name)").eq("athlete_id", athleteId),
    db.from("coach_waivers").select("id, version").eq("coach_id", coach?.gymId ?? "").order("version", { ascending: false }),
    db.from("athlete_waiver_signatures").select("waiver_id, signed_name, signed_at").eq("athlete_id", athleteId).order("signed_at", { ascending: false }).limit(20),
  ]);
  for (const r of [intake, athlete, prefs, metrics, goals, results, waivers, signatures]) if (r.error) throw new Error("Couldn't load intake.");
  const answers = (intake.data?.answers ?? {}) as Record<string, unknown>;
  const waiverVersions = new Map((waivers.data ?? []).map((waiver) => [waiver.id, waiver.version]));
  const latestWaiver = waivers.data?.[0] ?? null;
  const status = waiverStatus({
    waiverRequestedAt: athlete.data?.waiver_requested_at,
    latestWaiver,
    signatures: (signatures.data ?? []).map((signature) => ({
      signedAt: signature.signed_at,
      signedName: signature.signed_name,
      version: waiverVersions.get(signature.waiver_id) ?? 0,
    })),
  });
  const health = answers.health_screening && typeof answers.health_screening === "object" && !Array.isArray(answers.health_screening)
    ? answers.health_screening as Partial<HealthScreening> : null;
  const emergencyContact = health?.emergency_contact;
  const goalCategories = answers.goal_categories && typeof answers.goal_categories === "object" && !Array.isArray(answers.goal_categories)
    ? answers.goal_categories as Record<string, unknown> : {};
  const preferences = readPreferences(prefs.data);
  const details: Record<string, unknown> = {
    "Birth date": athlete.data?.birth_date, Sex: athlete.data?.sex, "Height (cm)": athlete.data?.height_cm,
    "Latest weight": `${formatWeight(metrics.data?.[0]?.weight_kg, units)}${metrics.data?.[0] ? ` (${metrics.data[0].measured_on})` : ""}`,
    "CrossFit level": athlete.data?.experience_level, "Injuries summary": athlete.data?.injuries,
    Diet: DIET_LABELS[preferences.diet_type], Allergies: preferences.allergies, Dislikes: preferences.dislikes, Cooking: cookingLabel(preferences.cooking_minutes),
    ...Object.fromEntries(Object.entries(answers).filter(([key]) => !["goal_ids", "goal_categories", "benchmark_result_ids", "health_screening", "health_flag"].includes(key)).map(([key, value]) => [key.replaceAll("_", " "), value])),
  };
  return <Card><CardHeader><CardTitle>Intake</CardTitle></CardHeader><CardContent className="space-y-5">
    <p>Status: <strong>{intake.data?.status.replaceAll("_", " ") ?? "Not requested"}</strong>{intake.data ? ` · Step ${intake.data.current_step} of 8 · Requested ${new Date(intake.data.requested_at).toLocaleDateString()}` : ""}</p>
    <form action={requestIntake.bind(null, athleteId)}><Button variant="outline">{intake.data ? "Resend" : "Send questionnaire"}</Button></form>
    <p className="text-sm text-muted-foreground">The athlete will see the questionnaire next time they open the portal. Resending keeps their previous answers.</p>
    {intake.data?.status === "completed" && <section className="space-y-3 rounded-lg border p-4">
      <h3 className="flex items-center gap-2 font-medium">Health screening{health && healthFlag(health) && <Badge variant="destructive">Health flag</Badge>}</h3>
      {health ? <dl className="grid gap-3 sm:grid-cols-2">
        {([
          ["Has a doctor ever said you have a heart condition?", health.heart_condition],
          ["Do you get chest pain during physical activity?", health.chest_pain_activity],
          ["Have you had chest pain at rest in the past month?", health.chest_pain_rest],
          ["Do you lose balance from dizziness, or have you fainted?", health.dizziness_or_fainting],
          ["Do you have a bone or joint problem that exercise could make worse?", health.bone_joint_problem],
          ["Do you take medication for blood pressure or a heart condition?", health.blood_pressure_or_heart_meds],
          ["Has a doctor told you not to exercise?", health.doctor_advised_no_exercise],
        ] as const).map(([label, answer]) => <div key={label}><dt className="text-sm font-medium">{label}</dt><dd className="text-sm text-muted-foreground">{answer ? "Yes" : "No"}</dd></div>)}
        <div><dt className="text-sm font-medium">Pregnancy</dt><dd className="text-sm text-muted-foreground">{health.pregnant === "prefer_not" ? "Prefer not to say" : health.pregnant === "yes" ? "Yes" : "No"}</dd></div>
        <div><dt className="text-sm font-medium">Recent surgery</dt><dd className="whitespace-pre-wrap text-sm text-muted-foreground">{health.recent_surgery ? `Yes${health.surgery_details ? ` · ${health.surgery_details}` : ""}` : "No"}</dd></div>
        <div><dt className="text-sm font-medium">Medications</dt><dd className="whitespace-pre-wrap text-sm text-muted-foreground">{display(health.medications)}</dd></div>
        <div><dt className="text-sm font-medium">Other health conditions</dt><dd className="whitespace-pre-wrap text-sm text-muted-foreground">{display(health.conditions)}</dd></div>
        <div><dt className="text-sm font-medium">Emergency contact</dt><dd className="text-sm text-muted-foreground">{emergencyContact ? <>{emergencyContact.name} ({emergencyContact.relationship}) · <a className="underline underline-offset-4" href={`tel:${emergencyContact.phone.replace(/[^\d+]/g, "")}`}>{emergencyContact.phone}</a></> : "—"}</dd></div>
      </dl> : <p className="text-sm text-muted-foreground">No health screening answers on file.</p>}
    </section>}
    <section className="space-y-2 rounded-lg border p-4">
      <h3 className="font-medium">Waiver</h3>
      {status.status === "needs_sign" ? <p className="text-sm">Not signed</p>
        : status.status === "signed" ? <div className="space-y-1 text-sm">
          <p>Signed by {status.signature.signedName} on {new Date(status.signature.signedAt).toLocaleString()} (version {status.signature.version})</p>
          <Link className="underline underline-offset-4" href={`/athletes/${athleteId}/waiver`}>View / print</Link>
        </div> : <p className="text-sm text-muted-foreground">Not requested</p>}
    </section>
    {intake.data?.status === "completed" && <>
      <p className="text-sm">Completed {intake.data.completed_at ? new Date(intake.data.completed_at).toLocaleDateString() : ""}</p>
      <dl className="grid gap-4 sm:grid-cols-2">{Object.entries(details).map(([label, value]) => <div key={label}><dt className="text-sm font-medium capitalize">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{display(value)}</dd></div>)}</dl>
      <div><h3 className="font-medium">Intake goals</h3>{goals.data?.filter((g) => Array.isArray(answers.goal_ids) && answers.goal_ids.includes(g.id)).map((g) => <p className="text-sm" key={g.id}>{g.title}{typeof goalCategories[g.id] === "string" && !g.title.startsWith(goalCategories[g.id] as string) ? ` · ${goalCategories[g.id]}` : ""}{g.target_value == null ? "" : ` · ${g.target_value}`}{g.target_date ? ` · by ${g.target_date}` : ""}</p>)}</div>
      <div><h3 className="font-medium">Known 1RMs & benchmarks</h3>{results.data?.filter((r) => Array.isArray(answers.benchmark_result_ids) && answers.benchmark_result_ids.includes(r.id)).map((r) => <p className="text-sm" key={r.id}>{r.benchmarks?.name}: {formatScore(r, units)}</p>)}</div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><RequestIntakeAiForm athleteId={athleteId} type="draft_program" label="Draft first 4 weeks" /><RequestIntakeAiForm athleteId={athleteId} type="adjust_macros" label="Suggest starting macros" /></div>
    </>}
  </CardContent></Card>;
}
