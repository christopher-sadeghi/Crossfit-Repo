import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SUGGESTION_LABELS } from "@/lib/ai/suggestions";
import { CHECK_IN_COLUMNS, checkInAttention } from "@/lib/check-in";
import { addDays } from "@/lib/nutrition";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCoach } from "@/lib/coach";
import { getOrigin } from "@/lib/auth/redirect";
import { SCHEDULE_LABEL, loadAthleteSchedule } from "@/lib/athlete-schedule";
import { feedbackSummary, needsAttention } from "@/lib/feedback";
import { JOURNAL_COLUMNS, journalSleepSummary, journalYesAnswers } from "@/lib/journal";
import { getToday } from "@/lib/time-zone";
import { formatGoalValue, goalProgress, latestMetric } from "@/lib/progress";
import { personalRecords } from "@/lib/results";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatScore, formatWeight, type Units } from "@/lib/units";

import { ArchiveButton } from "../archive-button";
import { CheckInsTab } from "./check-ins-tab";
import { AthleteAccessCard } from "../access-card";
import { PersonalProgramCopyForm } from "./program-copy-form";
import { GoalBar } from "./progress/goal-bar";
import { formatHeadline, type WhiteboardWorkout } from "../../programs/workouts/whiteboard";
import { LEVEL_LABELS } from "../options";

const TABS = ["overview", "check-ins", "workouts", "journal", "nutrition", "goals", "ai"] as const;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };
type ProfileScheduleWorkout = WhiteboardWorkout & {
  id: string;
  source_workout_id: string | null;
  week_number: number | null;
  day_number: number | null;
};

export default async function AthletePage({ params, searchParams }: Props) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const coach = await getCoach();
  const units: Units = coach?.units ?? "lb";

  const today = await getToday();
  const now = today;
  const sinceDate = new Date(`${today}T00:00:00Z`);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 6);
  const since = sinceDate.toISOString().slice(0, 10);
  const scheduleFromDate = new Date(`${today}T00:00:00Z`);
  scheduleFromDate.setUTCDate(scheduleFromDate.getUTCDate() - 7);
  const scheduleToDate = new Date(`${today}T00:00:00Z`);
  scheduleToDate.setUTCDate(scheduleToDate.getUTCDate() + 14);
  const scheduleFrom = scheduleFromDate.toISOString().slice(0, 10);
  const scheduleTo = scheduleToDate.toISOString().slice(0, 10);
  const [
    athleteRes,
    metricsRes,
    resultsRes,
    targetRes,
    foodRes,
    goalsRes,
    aiRes,
    scheduleItems,
    inviteRes,
    groupProgramsRes,
    athleteAssignmentsRes,
    journalRes,
    checkInsRes,
  ] = await Promise.all([
    supabase.from("athletes").select("*").eq("id", id).maybeSingle(),
    supabase.from("body_metrics").select("measured_on, weight_kg, body_fat_pct").eq("athlete_id", id).order("measured_on", { ascending: false }),
    supabase
      .from("workout_results")
      .select("id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, workout_id, logged_by, rpe, energy, sleep_hours, soreness, pain_notes, workouts(title, workout_type, workout_movements(movement_id))")
      .eq("athlete_id", id)
      .order("performed_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("nutrition_targets")
      .select("*")
      .eq("athlete_id", id)
      .lte("start_date", await getToday())
      .or(`end_date.is.null,end_date.gte.${await getToday()}`)
      .maybeSingle(),
    supabase.from("food_logs").select("logged_on, calories, protein_g, carbs_g, fat_g").eq("athlete_id", id).gte("logged_on", since),
    supabase.from("goals").select("id, title, goal_type, movement_id, metric, unit, start_value, target_value, target_date, status").eq("athlete_id", id).order("status").order("target_date"),
    supabase.from("ai_suggestions").select("id, suggestion_type, status, created_at, decided_at").eq("athlete_id", id).order("created_at", { ascending: false }),
    loadAthleteSchedule<ProfileScheduleWorkout>(
      supabase,
      id,
      { from: scheduleFrom, to: scheduleTo },
      "id, source_workout_id, title, workout_type, time_cap_seconds, rounds, week_number, day_number",
    ),
    supabase
      .from("athlete_invites")
      .select("email, token, created_at")
      .eq("athlete_id", id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle(),
    supabase.from("programs").select("id, name").is("athlete_id", null).order("name"),
    supabase.from("program_assignments").select("program_id").eq("athlete_id", id),
    supabase
      .from("athlete_journal_entries")
      .select(JOURNAL_COLUMNS)
      .eq("athlete_id", id)
      .order("entry_on", { ascending: false })
      .limit(30),
    supabase
      .from("athlete_journal_entries")
      .select(CHECK_IN_COLUMNS)
      .eq("athlete_id", id)
      .gte("entry_on", addDays(today, -55))
      .lte("entry_on", today)
      .order("entry_on", { ascending: false }),
  ]);

  const athlete = athleteRes.data;
  if (!athlete) notFound();
  const metrics = metricsRes.data ?? [];
  const latestWeight = latestMetric(metrics, "weight_kg");
  const results = resultsRes.data ?? [];
  const prs = personalRecords(results);
  const checkIns = checkInsRes.data ?? [];
  if (checkInsRes.error) throw checkInsRes.error;
  const workoutAttention = needsAttention(results, today);
  const checkAttention = checkInAttention(checkIns, today);
  const attention = {
    flagged: workoutAttention.flagged || checkAttention.flagged,
    reasons: [
      ...workoutAttention.reasons,
      ...checkAttention.reasons.map((text) => ({ date: today, kind: "check-in" as const, text })),
    ],
  };
  const target = targetRes.data;
  const invite = inviteRes.data;
  const inviteUrl = invite ? `${await getOrigin()}/join/${invite.token}` : null;
  const goals = goalsRes.data ?? [];
  const suggestions = aiRes.data ?? [];
  const journal = journalRes.data ?? [];
  const loggedWorkoutIds = new Set(results.map((result) => result.workout_id));
  const assignedProgramIds = new Set((athleteAssignmentsRes.data ?? []).map((assignment) => assignment.program_id));
  const groupPrograms = (groupProgramsRes.data ?? []).map((program) => ({
    ...program,
    assigned: assignedProgramIds.has(program.id),
  }));

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
  const age = athlete.birth_date ? ageOn(athlete.birth_date, new Date()) : null;

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
        <div className="mb-4 max-w-full overflow-x-auto">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="workouts">Workouts</TabsTrigger>
          <TabsTrigger value="check-ins">Check-ins</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="ai">AI History</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 md:grid-cols-3">
          {attention.flagged && (
            <Card className="border-amber-300/70 md:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                  <AlertTriangle className="size-4" />
                  Needs attention
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {attention.reasons.map((reason, index) => (
                    <li key={`${reason.date}-${reason.kind}-${index}`} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{formatDate(reason.date)}</span>
                      <span>
                        {reason.kind === "pain" ? "Pain noted" : reason.kind === "check-in" ? "Check-in" : "High effort"}
                        : {reason.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Stat label="Current weight" value={formatWeight(latestWeight?.weight_kg, units)} hint={latestWeight ? `as of ${formatDate(latestWeight.measured_on)}` : undefined} />
          <Stat label="Daily calories target" value={target ? `${target.calories} kcal` : "—"} hint={target ? `P ${target.protein_g}g · C ${target.carbs_g}g · F ${target.fat_g}g` : "No target set"} />
          <Stat label="Active goals" value={String(goals.filter((g) => g.status === "active").length)} hint={`${results.length} logged results · ${prs.length} PRs`} />
          <AthleteAccessCard
            athleteId={athlete.id}
            email={athlete.email}
            userId={athlete.user_id}
            invite={invite}
            inviteUrl={inviteUrl}
          />
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

        <TabsContent value="workouts" className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <Button variant="outline" className="justify-self-start" asChild>
                  <Link href={`/programs/workouts/new?athlete=${athlete.id}&date=${now}`}>Add one-off WOD</Link>
                </Button>
                <PersonalProgramCopyForm athleteId={athlete.id} programs={groupPrograms} defaultStart={now} />
              </div>
              {scheduleItems.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Date</TableHead>
                        <TableHead>Workout</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduleItems.map((item) => {
                        const logged =
                          loggedWorkoutIds.has(item.workout.id) ||
                          (item.workout.source_workout_id != null && loggedWorkoutIds.has(item.workout.source_workout_id));
                        return (
                          <TableRow key={`${item.source}-${item.programId ?? "one-off"}-${item.workout.id}`}>
                            <TableCell className="pl-4">{formatDate(item.date)}</TableCell>
                            <TableCell className="font-medium">
                              <Link href={`/programs/workouts/${item.workout.id}`} className="hover:underline">
                                {item.workout.title}
                              </Link>
                            </TableCell>
                            <TableCell>{formatHeadline(item.workout) || "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">{SCHEDULE_LABEL(item)}</Badge>
                                {item.programId && (
                                  <Link href={`/programs/${item.programId}`} className="text-sm text-muted-foreground hover:underline">
                                    {item.programName}
                                  </Link>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.date < now ? (
                                <Badge variant={logged ? "default" : "outline"}>{logged ? "Logged" : "Not logged"}</Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="p-4 text-center text-muted-foreground">No WODs in this date range.</p>
              )}
            </CardContent>
          </Card>
          <ListCard title="Personal records" empty="No results logged yet." show={prs.length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Workout</TableHead>
                  <TableHead>Best</TableHead>
                  <TableHead>Rx / Scaled</TableHead>
                  <TableHead>Set on</TableHead>
                  <TableHead>Attempts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 font-medium">{r.workouts?.title}</TableCell>
                    <TableCell className="font-medium">{formatScore(r, units)}</TableCell>
                    <TableCell>
                      <Badge variant={r.is_rx ? "default" : "outline"}>{r.is_rx ? "Rx" : "Scaled"}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(r.performed_on)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.attempts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListCard>
          <ListCard title="Result history" empty="No results logged yet." show={results.length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Workout</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Rx / Scaled</TableHead>
                  <TableHead>Feedback</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4">{formatDate(r.performed_on)}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/programs/workouts/${r.workout_id}`} className="hover:underline">
                          {r.workouts?.title}
                        </Link>
                        {r.logged_by != null && r.logged_by !== coach?.id && <Badge variant="secondary">Logged by athlete</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{formatScore(r, units)}</TableCell>
                    <TableCell>
                      <Badge variant={r.is_rx ? "default" : "outline"}>{r.is_rx ? "Rx" : "Scaled"}</Badge>
                    </TableCell>
                    <TableCell className="min-w-48">
                      {feedbackSummary(r) && <p>{feedbackSummary(r)}</p>}
                      {r.pain_notes && (
                        <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                          Pain: {r.pain_notes}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{r.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListCard>
        </TabsContent>

        <TabsContent value="check-ins">
          <CheckInsTab entries={checkIns} today={today} />
        </TabsContent>
        <TabsContent value="journal" className="grid gap-4">
          <ListCard title="Daily journal" empty="No journal entries yet. Athletes fill these in from their Journal tab." show={journal.length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Sleep</TableHead>
                  <TableHead>Habits</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journal.map((e) => (
                  <TableRow key={e.entry_on}>
                    <TableCell className="pl-4">{formatDate(e.entry_on)}</TableCell>
                    <TableCell>{journalSleepSummary(e) || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {journalYesAnswers(e).map((label) => (
                          <Badge key={label} variant="secondary">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-muted-foreground">{e.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListCard>
        </TabsContent>

        <TabsContent value="nutrition" className="grid gap-4">
          <Button variant="outline" className="justify-self-start" asChild>
            <Link href={`/nutrition/${athlete.id}`}>Open food log & targets</Link>
          </Button>
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

        <TabsContent value="goals" className="grid gap-4">
          <Button variant="outline" className="justify-self-start" asChild>
            <Link href={`/athletes/${athlete.id}/progress`}>Open progress, goals & charts</Link>
          </Button>
          <ListCard empty="No goals yet." show={goals.length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Goal</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start → now → target</TableHead>
                  <TableHead className="w-48">Progress</TableHead>
                  <TableHead>Target date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((g) => {
                  const p = goalProgress(g, { metrics, results });
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="pl-4 font-medium">{g.title}</TableCell>
                      <TableCell className="capitalize">{g.goal_type.replace("_", " ")}</TableCell>
                      <TableCell>
                        {formatGoalValue(g.start_value, g.unit, units)} → <strong>{formatGoalValue(p.current, g.unit, units)}</strong> → {formatGoalValue(g.target_value, g.unit, units)}
                      </TableCell>
                      <TableCell>{p.pct == null ? <span className="text-muted-foreground">—</span> : <GoalBar pct={p.pct} label={g.title} />}</TableCell>
                      <TableCell>{g.target_date ? formatDate(g.target_date) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={g.status === "achieved" ? "default" : "secondary"} className="capitalize">
                          {g.status === "abandoned" ? "Closed" : g.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
                    <TableCell className="pl-4">
                      <Link href={`/suggestions/${s.id}`} className="hover:underline">{formatDate(s.created_at)}</Link>
                    </TableCell>
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

function ageOn(birthDate: string, today: Date) {
  const [y, m, d] = birthDate.split("-").map(Number);
  const hadBirthday = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  return today.getFullYear() - y - (hadBirthday ? 0 : 1);
}
