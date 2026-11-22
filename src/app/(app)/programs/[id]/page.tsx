import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { programDate } from "@/lib/program-dates";
import { getToday } from "@/lib/time-zone";
import { loadWorkoutLibrary } from "@/lib/workout-library";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/units";

import { DeleteProgramButton, UnassignButton, UnplaceButton } from "../program-buttons";
import { AssignForm, PlaceWorkoutForm } from "../program-forms";
import { ProgramsNav } from "../programs-nav";
import { formatHeadline } from "../workouts/whiteboard";

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: program }, library, { data: athletes }] = await Promise.all([
    supabase
      .from("programs")
      .select(
        "id, name, description, weeks, athlete_id, source_program_id, athletes(id, first_name, last_name), workouts(id, title, workout_type, time_cap_seconds, rounds, week_number, day_number), program_assignments(id, start_date, athletes(id, first_name, last_name))",
      )
      .eq("id", id)
      .order("title", { referencedTable: "workouts" })
      .order("start_date", { referencedTable: "program_assignments" })
      .maybeSingle(),
    loadWorkoutLibrary(supabase, id),
    supabase.from("athletes").select("id, first_name, last_name").eq("status", "active").order("first_name").order("last_name"),
  ]);
  if (!program) notFound();

  const { data: sourceProgram } = program.source_program_id
    ? await supabase.from("programs").select("id, name").eq("id", program.source_program_id).maybeSingle()
    : { data: null };
  const assignments = program.program_assignments;
  const isPersonal = Boolean(program.athlete_id);
  const assigned = new Set(assignments.map((a) => a.athletes?.id));
  const starts = new Set(assignments.map((a) => a.start_date));
  // Show real dates on the calendar only when every athlete starts on the same day.
  const sharedStart = starts.size === 1 ? [...starts][0] : null;
  const unscheduled = program.workouts.filter((w) => !w.week_number || !w.day_number || w.week_number > program.weeks);

  return (
    <>
      <Link href="/programs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Programs
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {program.weeks} week{program.weeks === 1 ? "" : "s"} · {program.workouts.length} WODs · {assignments.length} athletes
          </p>
          {isPersonal && (
            <p className="mt-1 text-sm text-muted-foreground">
              Personal program for{" "}
              {program.athletes ? (
                <Link href={`/athletes/${program.athletes.id}`} className="hover:underline">
                  {program.athletes.first_name} {program.athletes.last_name}
                </Link>
              ) : (
                "athlete"
              )}
              {sourceProgram && (
                <>
                  {" · copied from "}
                  <Link href={`/programs/${sourceProgram.id}`} className="hover:underline">
                    {sourceProgram.name}
                  </Link>
                </>
              )}
            </p>
          )}
          {program.description && <p className="mt-2 max-w-2xl text-muted-foreground">{program.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/programs/${program.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <DeleteProgramButton id={program.id} workoutCount={program.workouts.length} />
        </div>
      </div>
      <ProgramsNav active="/programs" />

      <div className="grid gap-6 2xl:grid-cols-[1fr_22rem]">
        <section aria-label="Program calendar" className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Add an existing WOD</CardTitle>
            </CardHeader>
            <CardContent>
              <PlaceWorkoutForm programId={program.id} weeks={program.weeks} workouts={library} />
            </CardContent>
          </Card>
          {Array.from({ length: program.weeks }, (_, wi) => {
            const week = wi + 1;
            return (
              <div key={week}>
                <h2 className="mb-2 text-sm font-semibold">Week {week}</h2>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-7">
                  {Array.from({ length: 7 }, (_, di) => {
                    const day = di + 1;
                    const wods = program.workouts.filter((w) => w.week_number === week && w.day_number === day);
                    return (
                      <div key={day} data-testid={`w${week}d${day}`} className="flex min-h-24 flex-col gap-1 rounded-lg border bg-card p-2 text-xs">
                        <div className="flex items-center justify-between gap-1 text-muted-foreground">
                          <span>{sharedStart ? shortDate(programDate(sharedStart, week, day)) : `Day ${day}`}</span>
                          <Link
                            href={`/programs/workouts/new?program=${program.id}&week=${week}&day=${day}`}
                            aria-label={`New WOD for week ${week} day ${day}`}
                            title="New WOD on this day"
                            className="shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground"
                          >
                            <Plus className="size-3.5" />
                          </Link>
                        </div>
                        {wods.map((w) => (
                          <div key={w.id} className="flex items-start gap-1 rounded bg-muted/60 px-1.5 py-1">
                            <Link href={`/programs/workouts/${w.id}`} className="min-w-0 flex-1 hover:underline">
                              <span className="block truncate font-medium">{w.title}</span>
                              <span className="block truncate text-muted-foreground">{formatHeadline(w)}</span>
                            </Link>
                            <UnplaceButton programId={program.id} workoutId={w.id} title={w.title} />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {unscheduled.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Not on the calendar: {unscheduled.map((w) => w.title).join(", ")}
            </p>
          )}
        </section>

        <aside className="grid content-start gap-4">
          {isPersonal ? (
            <Card>
              <CardHeader>
                <CardTitle>Assigned athlete</CardTitle>
              </CardHeader>
              <CardContent>
                {assignments.length ? (
                  <ul className="grid gap-1 text-sm">
                    {assignments.map((assignment) => (
                      <li key={assignment.id}>
                        {assignment.athletes ? (
                          <Link href={`/athletes/${assignment.athletes.id}`} className="font-medium hover:underline">
                            {assignment.athletes.first_name} {assignment.athletes.last_name}
                          </Link>
                        ) : (
                          "Athlete"
                        )}
                        <span className="block text-xs text-muted-foreground">Starts {formatDate(assignment.start_date)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No assignment was found for this personal program.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Assign athletes</CardTitle>
                </CardHeader>
                <CardContent>
                  <AssignForm
                    programId={program.id}
                    defaultStart={await getToday()}
                    athletes={(athletes ?? [])
                      .filter((a) => !assigned.has(a.id))
                      .map((a) => ({ id: a.id, name: `${a.first_name} ${a.last_name}` }))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Assigned ({assignments.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {assignments.length ? (
                    <ul className="grid gap-1 text-sm">
                      {assignments.map((a) => {
                        const name = a.athletes ? `${a.athletes.first_name} ${a.athletes.last_name}` : "Athlete";
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-2">
                            <span>
                              {a.athletes ? (
                                <Link href={`/athletes/${a.athletes.id}`} className="font-medium hover:underline">
                                  {name}
                                </Link>
                              ) : (
                                name
                              )}
                              <span className="block text-xs text-muted-foreground">Starts {formatDate(a.start_date)}</span>
                            </span>
                            <UnassignButton programId={program.id} assignmentId={a.id} name={name} />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No athletes on this program yet.</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
