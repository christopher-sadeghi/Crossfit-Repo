import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatScore, formatWeight, type Units } from "@/lib/units";

import { ArchiveButton } from "../archive-button";
import { LEVEL_LABELS } from "../options";

const TABS = ["overview", "workouts", "nutrition", "goals", "ai"] as const;
const SUGGESTION_LABELS = {
  write_workout: "Write workout",
  scale_workout: "Scale workout",
  adjust_macros: "Adjust macros",
  progress_summary: "Progress summary",
};

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export default async function AthletePage({ params, searchParams }: Props) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const coach = await getCoach();
  const units: Units = coach?.units ?? "lb";

  const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const [athleteRes, metricsRes, resultsRes, targetRes, foodRes, goalsRes, aiRes] = await Promise.all([
    supabase.from("athletes").select("*").eq("id", id).maybeSingle(),
    supabase.from("body_metrics").select("measured_on, weight_kg").eq("athlete_id", id).order("measured_on", { ascending: false }).limit(8),
    supabase
      .from("workout_results")
      .select("id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, workouts(title, workout_type)")
      .eq("athlete_id", id)
      .order("performed_on", { ascending: false })
      .limit(25),
    supabase.from("nutrition_targets").select("*").eq("athlete_id", id).is("end_date", null).maybeSingle(),
    supabase.from("food_logs").select("logged_on, calories, protein_g, carbs_g, fat_g").eq("athlete_id", id).gte("logged_on", since),
    supabase.from("goals").select("id, title, goal_type, metric, unit, start_value, target_value, target_date, status").eq("athlete_id", id).order("status").order("target_date"),
    supabase.from("ai_suggestions").select("id, suggestion_type, status, created_at, decided_at").eq("athlete_id", id).order("created_at", { ascending: false }),
  ]);

  const athlete = athleteRes.data;
  if (!athlete) notFound();
  const metrics = metricsRes.data ?? [];
  const results = resultsRes.data ?? [];
  const target = targetRes.data;
  const goals = goalsRes.data ?? [];
  const suggestions = aiRes.data ?? [];

  const days = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
  for (const f of foodRes.data ?? []) {
    const d = days.get(f.logged_on) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    d.calories += f.calories;
    d.protein += Number(f.protein_g);
    d.carbs += Number(f.carbs_g);
    d.fat += Number(f.fat_g);
    days.set(f.logged_on, d);
  }
  const dayRows = [...days.entries()].sort(([a], [b]) => b.localeCompare(a));
  const age = athlete.birth_date
    ? Math.floor((Date.now() - new Date(athlete.birth_date).getTime()) / (365.25 * 86_400_000))
    : null;

  return (
    <>
      <Link href="/athletes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Athletes
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            {athlete.first_name} {athlete.last_name}
            {athlete.status === "archived" && <Badge variant="outline">Archived</Badge>}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            <Badge variant="secondary">{LEVEL_LABELS[athlete.experience_level]}</Badge>
            {[age && `${age} yrs`, athlete.sex, athlete.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/athletes/${athlete.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <ArchiveButton id={athlete.id} status={athlete.status} />
        </div>
      </div>

      <Tabs defaultValue={TABS.includes(tab as (typeof TABS)[number]) ? tab : "overview"}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="workouts">Workouts</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="ai">AI History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 md:grid-cols-3">
          <Stat label="Current weight" value={formatWeight(metrics[0]?.weight_kg, units)} hint={metrics[0] && `as of ${formatDate(metrics[0].measured_on)}`} />
          <Stat label="Daily calories target" value={target ? `${target.calories} kcal` : "—"} hint={target ? `P ${target.protein_g}g · C ${target.carbs_g}g · F ${target.fat_g}g` : "No target set"} />
          <Stat label="Active goals" value={String(goals.filter((g) => g.status === "active").length)} hint={`${results.length ? `${results.length}+` : "0"} logged results`} />
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Injuries / limitations</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">{athlete.injuries ?? <span className="text-muted-foreground">None recorded.</span>}</CardContent>
          </Card>
          {athlete.notes && (
            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle>Coach notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-line">{athlete.notes}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="workouts">
          <ListCard empty="No results logged yet." show={results.length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Workout</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Rx / Scaled</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4">{formatDate(r.performed_on)}</TableCell>
                    <TableCell className="font-medium">{r.workouts?.title}</TableCell>
                    <TableCell>{formatScore(r, units)}</TableCell>
                    <TableCell>
                      <Badge variant={r.is_rx ? "default" : "outline"}>{r.is_rx ? "Rx" : "Scaled"}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{r.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListCard>
        </TabsContent>

        <TabsContent value="nutrition">
          <ListCard empty="No food logged in the last 7 days." show={dayRows.length > 0} title={target ? `Target: ${target.calories} kcal · P ${target.protein_g}g · C ${target.carbs_g}g · F ${target.fat_g}g` : "No macro target set"}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Day</TableHead>
                  <TableHead>Calories</TableHead>
                  <TableHead>Protein</TableHead>
                  <TableHead>Carbs</TableHead>
                  <TableHead>Fat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayRows.map(([day, d]) => (
                  <TableRow key={day}>
                    <TableCell className="pl-4">{formatDate(day)}</TableCell>
                    <TableCell>{d.calories}</TableCell>
                    <TableCell>{Math.round(d.protein)}g</TableCell>
                    <TableCell>{Math.round(d.carbs)}g</TableCell>
                    <TableCell>{Math.round(d.fat)}g</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListCard>
        </TabsContent>

        <TabsContent value="goals">
          <ListCard empty="No goals yet." show={goals.length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Goal</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start → target</TableHead>
                  <TableHead>Target date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="pl-4 font-medium">{g.title}</TableCell>
                    <TableCell className="capitalize">{g.goal_type.replace("_", " ")}</TableCell>
                    <TableCell>
                      {g.start_value ?? "—"} → {g.target_value ?? "—"} {g.unit}
                    </TableCell>
                    <TableCell>{g.target_date ? formatDate(g.target_date) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={g.status === "achieved" ? "default" : "secondary"} className="capitalize">
                        {g.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListCard>
        </TabsContent>

        <TabsContent value="ai">
          <ListCard empty="No AI suggestions for this athlete yet." show={suggestions.length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Requested</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Decided</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">{formatDate(s.created_at)}</TableCell>
                    <TableCell>{SUGGESTION_LABELS[s.suggestion_type]}</TableCell>
                    <TableCell className="capitalize">{s.status}</TableCell>
                    <TableCell>{s.decided_at ? formatDate(s.decided_at) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListCard>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | false }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ListCard({ show, empty, title, children }: { show: boolean; empty: string; title?: string; children: React.ReactNode }) {
  return (
    <Card className={title ? undefined : "py-0"}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-0">{show ? children : <p className="p-8 text-center text-muted-foreground">{empty}</p>}</CardContent>
    </Card>
  );
}
