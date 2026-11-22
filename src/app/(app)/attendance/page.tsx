import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { driftReasonText } from "@/components/consistency-summary";
import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { getCoach } from "@/lib/coach";
import { loadDriftingAthletes } from "@/lib/consistency-data";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { AttendanceToggle } from "../athletes/[id]/attendance-forms";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [params, today, coach, supabase] = await Promise.all([searchParams, getToday(), getCoach(), createClient()]);
  if (!coach) redirect("/login");
  const parsed = z.iso.date().safeParse(params.date);
  const validDate = parsed.success && parsed.data <= today;
  const date = validDate ? parsed.data : today;
  const [{ data: athletes, error }, resultRows, attendanceRows, flagged] = await Promise.all([
    supabase.from("athletes").select("id,first_name,last_name").eq("coach_id", coach.gymId).eq("status", "active").order("first_name").order("last_name"),
    supabase.from("workout_results").select("athlete_id").eq("coach_id", coach.gymId).eq("performed_on", date),
    supabase.from("attendance").select("athlete_id,kind").eq("coach_id", coach.gymId).eq("attended_on", date),
    loadDriftingAthletes(supabase, coach.gymId, today, coach.driftDays),
  ]);
  if (error || resultRows.error || attendanceRows.error) throw new Error("Couldn't load the daily roster. Please try again.");
  const loggedResults = new Set((resultRows.data ?? []).map((r) => r.athlete_id));
  const marked = new Set((attendanceRows.data ?? []).map((a) => `${a.athlete_id}:${a.kind}`));
  const roster = await Promise.all((athletes ?? []).map(async (athlete) => ({
    athlete,
    schedule: await loadAthleteSchedule(supabase, athlete.id, { from: date, to: date }, "id,source_workout_id,title,week_number,day_number"),
  })));

  return (
    <div className="grid gap-6">
      <PageHeader title="Attendance" description="See who's training and mark attendance for the day." />
      <form action="/attendance" method="get" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2"><Label htmlFor="roster-date">Roster date</Label><Input id="roster-date" type="date" name="date" required max={today} defaultValue={date} /></div>
        <Button type="submit" variant="outline">Show day</Button>
      </form>
      {params.date && !validDate && <p role="alert" className="text-sm text-muted-foreground">Choose a valid date no later than today. Showing today instead.</p>}
      <Card>
        <CardHeader><CardTitle>Daily roster · {date}</CardTitle><p className="text-sm text-muted-foreground">Mark Class, Open gym, or both. Select a marked session again to remove it.</p></CardHeader>
        <CardContent>
          {roster.length ? <ul className="divide-y">{roster.map(({ athlete, schedule }) => (
            <li key={athlete.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-1">
                <Link className="w-fit font-medium underline-offset-4 hover:underline" href={`/athletes/${athlete.id}?tab=consistency`}>{athlete.first_name} {athlete.last_name}</Link>
                {schedule.length ? <ul className="text-sm text-muted-foreground">{schedule.map((item) => <li key={item.workout.id}>{item.workout.title}</li>)}</ul> : <p className="text-sm text-muted-foreground">No workout scheduled</p>}
                <Badge variant={loggedResults.has(athlete.id) ? "secondary" : "outline"} className="w-fit">{loggedResults.has(athlete.id) ? "Result logged" : "No result logged"}</Badge>
              </div>
              <div role="group" aria-label={`Attendance for ${athlete.first_name} ${athlete.last_name}`} className="flex flex-wrap items-start gap-2">
                {(["class", "open_gym"] as const).map((kind) => <AttendanceToggle key={kind} athleteId={athlete.id} date={date} kind={kind} marked={marked.has(`${athlete.id}:${kind}`)} />)}
              </div>
            </li>
          ))}</ul> : <p className="text-sm text-muted-foreground">No active athletes yet. Add an athlete to start tracking attendance.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Drifting athletes</CardTitle><p className="text-sm text-muted-foreground">Based on activity through today. A quick check-in can help them get back on track.</p></CardHeader>
        <CardContent>
          {flagged.length ? <ul className="grid gap-3">{flagged.map(({ athlete, reasons, daysSinceActivity }) => <li key={athlete.id} className="rounded-md border p-3 text-sm"><Link href={`/athletes/${athlete.id}?tab=consistency`} className="font-medium underline underline-offset-4">{athlete.first_name} {athlete.last_name}</Link><p className="mt-1 text-muted-foreground">{driftReasonText(reasons, daysSinceActivity)}.</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No athletes are flagged as drifting right now.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
