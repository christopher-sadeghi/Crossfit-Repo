import { CalendarDays, CircleAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OpenCoachChatButton } from "@/components/assistant/open-coach-chat-button";
import { driftReasonText } from "@/components/consistency-summary";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { checkCoachTrainingLoad } from "@/lib/activity-training-warning";
import { loadCheckInAttention } from "@/lib/check-in";
import { getCoach } from "@/lib/coach";
import { loadCoachConsistency } from "@/lib/consistency-data";
import { todaysWorkouts, weekCompletion } from "@/lib/dashboard";
import { checkDriftingAthletes, checkMissedWorkouts, checkProgressReminders } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { formatDate } from "@/lib/units";

const reviewLink = "text-sm font-medium underline underline-offset-4 hover:text-primary";

export default async function DashboardPage() {
  const coach = await getCoach();
  if (!coach) redirect("/login");

  const [supabase, today] = await Promise.all([createClient(), getToday()]);
  const [roster, approvals, formChecks, messages] = await Promise.all([
    loadCoachConsistency(supabase, coach.id, today, coach.driftDays),
    supabase.from("ai_suggestions").select("id", { count: "exact", head: true })
      .eq("coach_id", coach.id).eq("status", "pending"),
    supabase.from("form_reviews").select("id, athlete_id").eq("coach_id", coach.id)
      .eq("status", "awaiting_review").order("created_at"),
    supabase.from("messages").select("athlete_id").eq("coach_id", coach.id)
      .neq("sender_id", coach.id).is("read_at", null),
    checkMissedWorkouts(supabase, coach),
    checkProgressReminders(supabase, { coachId: coach.id }),
  ]);
  const error = approvals.error ?? formChecks.error ?? messages.error;
  if (error) throw new Error("Couldn't load the dashboard.", { cause: error });

  const [checkIns, loadWarnings] = await Promise.all([
    loadCheckInAttention(supabase, today, roster.map(({ athlete }) => athlete.id)),
    checkCoachTrainingLoad(supabase, roster.map(({ athlete }) => athlete), today, coach.loadWarningRatio),
    checkDriftingAthletes(supabase, coach, { today, athletes: roster.filter((row) => row.drifting) }),
  ]);
  const unread = new Set(messages.data?.map(({ athlete_id }) => athlete_id));
  const formByAthlete = new Map<string, string>();
  for (const { id, athlete_id } of formChecks.data ?? []) {
    if (!formByAthlete.has(athlete_id)) formByAthlete.set(athlete_id, id);
  }
  const athletes = roster.map((row) => ({
    ...row,
    athlete: { ...row.athlete, fullName: `${row.athlete.first_name} ${row.athlete.last_name}` },
  })).sort((a, b) => a.athlete.fullName.localeCompare(b.athlete.fullName));
  const workoutRows = todaysWorkouts(athletes, today);
  const completion = weekCompletion(roster.map(({ stats }) => stats), today);
  const attention = athletes.flatMap((row) => {
    const { id, fullName } = row.athlete;
    const reasons: { text: string; href: string }[] = [];
    if (row.drifting) reasons.push({
      text: `Drifting · ${driftReasonText(row.reasons, row.daysSinceActivity)}`,
      href: `/athletes/${id}?tab=consistency`,
    });
    for (const { text } of checkIns.get(id)?.reasons ?? []) {
      reasons.push({ text, href: `/athletes/${id}?tab=check-ins` });
    }
    const ratio = loadWarnings.get(id);
    if (ratio !== undefined) reasons.push({
      text: `High training load · ${ratio.toFixed(2)}× weekly average`,
      href: `/athletes/${id}?tab=load`,
    });
    const formId = formByAthlete.get(id);
    if (formId) reasons.push({ text: "Form check awaiting review", href: `/form-checks/${formId}` });
    if (unread.has(id)) reasons.push({ text: "Unread athlete messages", href: `/messages/${id}` });
    return reasons.length ? [{ id, fullName, reasons }] : [];
  });

  const firstName = coach.fullName.trim().split(/\s+/)[0];
  const pending = approvals.count ?? 0;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description={formatDate(today)}
      />
      {!roster.length && (
        <Card className="mb-5 border border-dashed bg-muted/30">
          <CardHeader>
            <h2 className="font-semibold">No active athletes yet</h2>
            <p className="text-muted-foreground">Add your first athlete, or explore the dashboard with sample athletes and workouts.</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link href="/athletes/new">Add athlete</Link></Button>
            <Button asChild variant="outline"><Link href="/settings#demo-data">Load demo data</Link></Button>
          </CardContent>
        </Card>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid min-w-0 gap-5">
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> Today&apos;s WODs</h2>
            </CardHeader>
            <CardContent className="grid gap-3">
              {workoutRows.length ? (
                <ul className="divide-y">
                  {workoutRows.map(({ item, athleteNames }) => (
                    <li key={item.workout.id} className="grid gap-1 py-2 first:pt-0">
                      <Link href={`/programs/workouts/${item.workout.id}`} className="break-words font-medium hover:underline">{item.workout.title}</Link>
                      <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{item.source === "group" ? "Group" : item.source === "personal" ? "Personal" : "Athlete-only"}</Badge>
                        <span className="min-w-0 break-words">{item.source === "group"
                          ? `${item.programName} · ${athleteNames.length} ${athleteNames.length === 1 ? "athlete" : "athletes"}`
                          : athleteNames.join(", ")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted-foreground">No workouts scheduled for today.</p>}
              <Link href={`/attendance?date=${today}`} className={reviewLink}>View today&apos;s schedule and attendance</Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> Pending AI approvals</h2>
            </CardHeader>
            <CardContent className="grid gap-2">
              <p className="text-3xl font-semibold tabular-nums">{pending}</p>
              <p className="text-muted-foreground">{pending ? "Review suggestions before they’re applied." : "No AI suggestions waiting for approval."}</p>
              <Link href="/settings/ai-history?status=pending" className={reviewLink}>Review pending in AI history</Link>
              <p className="text-xs text-muted-foreground">You can also review inline in <OpenCoachChatButton />, <Link href="/messages" className="underline underline-offset-4">Messages</Link>, or on <Link href="/athletes" className="underline underline-offset-4">athlete pages</Link>.</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 font-semibold"><CircleAlert className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> Athletes who need attention</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            {attention.length ? (
              <ul className="divide-y">
                {attention.map(({ id, fullName, reasons }) => (
                  <li key={id} className="grid gap-1 py-2 first:pt-0">
                    <Link href={`/athletes/${id}`} className="break-words font-medium hover:underline">{fullName}</Link>
                    <ul className="grid gap-1">
                      {reasons.map(({ text, href }) => (
                        <li key={text}><Link href={href} className="break-words text-muted-foreground underline underline-offset-4 hover:text-foreground">{text}</Link></li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted-foreground">{roster.length ? "No athletes are flagged right now." : "Athlete flags will appear when you have active athletes."}</p>}
            <Link href="/athletes" className={reviewLink}>View all athletes</Link>
          </CardContent>
        </Card>
      </div>
      <Card size="sm" className="mt-5">
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-semibold">This week</h2>
            <p className="text-muted-foreground">{completion === null
              ? "No scheduled days to score yet"
              : <><span className="font-semibold text-foreground tabular-nums">{completion}%</span> scheduled day completion · Monday to today</>}</p>
          </div>
          <Link href="/attendance" className={reviewLink}>Attendance</Link>
        </CardContent>
      </Card>
    </div>
  );
}
