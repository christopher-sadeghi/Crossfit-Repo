import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadAthleteBenchmarks } from "@/lib/benchmarks";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { formatDate } from "@/lib/units";
import { getViewer } from "@/lib/viewer";
import {
  BenchmarkActionForm,
  CustomBenchmarkForm,
} from "../athletes/[id]/benchmark-forms";
import {
  deleteCustomBenchmark,
  saveRetestInterval,
} from "../athletes/[id]/benchmark-actions";

export default async function BenchmarkLibraryPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind !== "coach") redirect("/athlete/prs");
  const supabase = await createClient();
  const today = await getToday();
  const [library, settings, movements, athletes] = await Promise.all([
    supabase.from("benchmarks").select("*").order("name"),
    supabase
      .from("benchmark_settings")
      .select("benchmark_id, retest_weeks")
      .eq("coach_id", viewer.id),
    supabase.from("movements").select("id, name").order("name"),
    supabase
      .from("athletes")
      .select("id, first_name, last_name")
      .eq("coach_id", viewer.id)
      .eq("status", "active")
      .order("first_name"),
  ]);
  for (const result of [library, settings, movements, athletes])
    if (result.error) throw result.error;
  const due = (
    await Promise.all(
      (athletes.data ?? []).map(async (athlete) => ({
        athlete,
        benchmarks: (
          await loadAthleteBenchmarks(supabase, athlete.id, today)
        ).filter((b) => b.retestDue),
      })),
    )
  ).filter((row) => row.benchmarks.length);
  const benchmarks = library.data ?? [];
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Benchmark library
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Classic tests, lift records, and your custom benchmarks. Set a retest
          rhythm for your athletes.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Due for retest</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {due.length ? (
            due.map(({ athlete, benchmarks }) => (
              <div key={athlete.id} className="rounded-md border p-3">
                <Link
                  className="font-medium underline underline-offset-4"
                  href={`/athletes/${athlete.id}?tab=benchmarks`}
                >
                  {athlete.first_name} {athlete.last_name}
                </Link>
                <ul className="mt-2 grid gap-2">
                  {benchmarks.map((b) => (
                    <li key={b.id} className="text-sm">
                      <Badge variant="outline">Retest due</Badge> {b.name} ·
                      Last tested {formatDate(b.last!.performed_on)} · Every{" "}
                      {b.retestWeeks} weeks
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No active athletes are due for a retest. Set intervals below to
              start tracking.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add custom benchmark</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomBenchmarkForm movements={movements.data ?? []} />
        </CardContent>
      </Card>
      {(
        [
          ["girl", "Girls"],
          ["hero", "Heroes"],
          ["lift", "Lifts"],
          ["custom", "Custom"],
        ] as const
      ).map(([kind, title]) => (
        <section key={kind} className="grid gap-3" aria-label={title}>
          <h2 className="text-xl font-semibold">{title}</h2>
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {benchmarks
              .filter((b) => b.kind === kind)
              .map((b) => (
                <Card key={b.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{b.name}</CardTitle>
                      <Badge variant="secondary">
                        {b.workout_type.replaceAll("_", " ")}
                      </Badge>
                      <Badge variant="outline">
                        {b.coach_id ? "Your benchmark" : "Shared library"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <p className="whitespace-pre-wrap text-sm">
                      {b.description || "No description."}
                    </p>
                    <BenchmarkActionForm
                      action={saveRetestInterval}
                      label="Save interval"
                    >
                      <input type="hidden" name="benchmark_id" value={b.id} />
                      <label className="grid gap-1 text-sm">
                        Retest every (weeks)
                        <Input
                          name="retest_weeks"
                          type="number"
                          min="1"
                          max="104"
                          step="1"
                          placeholder="None"
                          defaultValue={
                            settings.data?.find((s) => s.benchmark_id === b.id)
                              ?.retest_weeks ?? ""
                          }
                        />
                      </label>
                      <p className="text-xs text-muted-foreground">
                        1–104 weeks. Clear for no reminder. Applies to all your
                        athletes.
                      </p>
                    </BenchmarkActionForm>
                    {b.coach_id === viewer.id && (
                      <details>
                        <summary className="cursor-pointer text-sm font-medium">
                          Edit or delete custom benchmark
                        </summary>
                        <div className="mt-3 grid gap-4">
                          <CustomBenchmarkForm
                            benchmark={b}
                            movements={movements.data ?? []}
                          />
                          <BenchmarkActionForm
                            action={deleteCustomBenchmark}
                            label="Delete benchmark & direct results"
                            destructive
                          >
                            <input type="hidden" name="id" value={b.id} />
                          </BenchmarkActionForm>
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
          {!benchmarks.some((b) => b.kind === kind) && (
            <p className="text-sm text-muted-foreground">
              No {title.toLowerCase()} benchmarks yet.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
