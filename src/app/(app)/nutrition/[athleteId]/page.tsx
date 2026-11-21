import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestMacroSuggestionForm } from "@/components/suggestions/suggestion-forms";
import { MACRO_DISCLAIMER } from "@/lib/ai/suggestions";
import { addDays, MEALS, onTarget, targetOn, totals, type Macros } from "@/lib/nutrition";
import { getToday } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/units";

import { AddFoodForm, FoodRow, TargetForm } from "../forms";

type Props = { params: Promise<{ athleteId: string }>; searchParams: Promise<{ date?: string }> };

const weekday = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default async function AthleteNutritionPage({ params, searchParams }: Props) {
  const [{ athleteId }, { date: rawDate }] = await Promise.all([params, searchParams]);
  const now = await getToday();
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate)) ? rawDate : now;
  const weekStart = addDays(date, -6);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const supabase = await createClient();
  const [{ data: athlete }, { data: targets }, { data: food }] = await Promise.all([
    supabase.from("athletes").select("id, first_name, last_name").eq("id", athleteId).maybeSingle(),
    supabase.from("nutrition_targets").select("id, calories, protein_g, carbs_g, fat_g, start_date, end_date, notes").eq("athlete_id", athleteId).order("start_date", { ascending: false }),
    supabase
      .from("food_logs")
      .select("id, logged_on, meal, food_name, calories, protein_g, carbs_g, fat_g")
      .eq("athlete_id", athleteId)
      .gte("logged_on", weekStart)
      .lte("logged_on", date)
      .order("created_at"),
  ]);
  if (!athlete) notFound();

  const allTargets = targets ?? [];
  const current = targetOn(allTargets, now);
  const dayTarget = targetOn(allTargets, date);
  const entries = (food ?? [])
    .filter((f) => f.logged_on === date)
    .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  const day = totals(entries);

  const weekRows = week.map((d) => {
    const rows = (food ?? []).filter((f) => f.logged_on === d);
    const t = targetOn(allTargets, d);
    const sum = totals(rows);
    return { d, logged: rows.length > 0, sum, target: t, met: rows.length > 0 && t != null && onTarget(sum, t) };
  });
  const logged = weekRows.filter((r) => r.logged);
  const avg = (k: keyof Macros) => (logged.length ? Math.round(logged.reduce((s, r) => s + r.sum[k], 0) / logged.length) : null);
  const met = weekRows.filter((r) => r.met).length;
  const name = `${athlete.first_name} ${athlete.last_name}`;

  return (
    <>
      <Link href="/nutrition" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Nutrition
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-muted-foreground">
            <Link href={`/athletes/${athlete.id}?tab=nutrition`} className="hover:underline">
              View profile
            </Link>
          </p>
        </div>
        <nav aria-label="Choose day" className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href={`?date=${addDays(date, -1)}`} aria-label="Previous day">
              <ChevronLeft />
            </Link>
          </Button>
          <form className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={date}
              aria-label="Day"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <Button type="submit" variant="outline">
              Go
            </Button>
          </form>
          <Button variant="outline" size="icon" asChild>
            <Link href={`?date=${addDays(date, 1)}`} aria-label="Next day">
              <ChevronRight />
            </Link>
          </Button>
          {date !== now && (
            <Button variant="ghost" asChild>
              <Link href="?">Today</Link>
            </Button>
          )}
        </nav>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>AI macro suggestion</CardTitle>
          <p className="text-sm text-muted-foreground">
            The AI looks at goals, body weight trend, recent food logs and training volume. Nothing changes until you approve.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <RequestMacroSuggestionForm athleteId={athlete.id} />
          <p className="text-xs text-muted-foreground">{MACRO_DISCLAIMER}</p>
        </CardContent>
      </Card>

      <section aria-label="Daily intake" className="mb-6 grid gap-4">
        <h2 className="text-lg font-semibold">{date === now ? "Today" : weekday(date)}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MacroBar label="Calories" value={day.calories} target={dayTarget?.calories} unit=" kcal" />
          <MacroBar label="Protein" value={day.protein} target={dayTarget?.protein_g} unit="g" />
          <MacroBar label="Carbs" value={day.carbs} target={dayTarget?.carbs_g} unit="g" />
          <MacroBar label="Fat" value={day.fat} target={dayTarget?.fat_g} unit="g" />
        </div>
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Food log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {entries.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Meal</TableHead>
                    <TableHead>Food</TableHead>
                    <TableHead>kcal</TableHead>
                    <TableHead>Protein</TableHead>
                    <TableHead>Carbs</TableHead>
                    <TableHead>Fat</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <FoodRow key={e.id} athleteId={athlete.id} date={date} entry={{ ...e, protein_g: Number(e.protein_g), carbs_g: Number(e.carbs_g), fat_g: Number(e.fat_g) }} />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing logged for this day.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Add food</CardTitle>
          </CardHeader>
          <CardContent>
            <AddFoodForm athleteId={athlete.id} date={date} />
          </CardContent>
        </Card>
      </section>

      <section aria-label="Weekly view" className="mb-6">
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>
              Week of {formatDate(weekStart)} – {formatDate(date)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Averages over {logged.length} logged day{logged.length === 1 ? "" : "s"}: {avg("calories") ?? "—"} kcal · P {avg("protein") ?? "—"}g · C {avg("carbs") ?? "—"}g · F {avg("fat") ?? "—"}g.{" "}
              <strong className="text-foreground">On target {met} of 7 days.</strong>
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Day</TableHead>
                  <TableHead>Calories</TableHead>
                  <TableHead>Protein</TableHead>
                  <TableHead>Carbs</TableHead>
                  <TableHead>Fat</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weekRows.map((r) => (
                  <TableRow key={r.d} className={r.d === date ? "bg-muted/50" : undefined}>
                    <TableCell className="pl-4">
                      <Link href={`?date=${r.d}`} className="hover:underline">
                        {weekday(r.d)}
                      </Link>
                    </TableCell>
                    <TableCell>{r.logged ? `${r.sum.calories}${r.target ? ` / ${r.target.calories}` : ""}` : "—"}</TableCell>
                    <TableCell>{r.logged ? `${Math.round(r.sum.protein)}g${r.target ? ` / ${r.target.protein_g}g` : ""}` : "—"}</TableCell>
                    <TableCell>{r.logged ? `${Math.round(r.sum.carbs)}g` : "—"}</TableCell>
                    <TableCell>{r.logged ? `${Math.round(r.sum.fat)}g` : "—"}</TableCell>
                    <TableCell>
                      {!r.logged ? (
                        <span className="text-muted-foreground">Not logged</span>
                      ) : !r.target ? (
                        <span className="text-muted-foreground">No target</span>
                      ) : (
                        <Badge variant={r.met ? "default" : "outline"}>{r.met ? "On target" : "Off target"}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">On target = calories within ±10% and protein at least 90% of that day&apos;s target.</p>
      </section>

      <section aria-label="Macro targets" className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{current ? "Change target" : "Set a target"}</CardTitle>
            <p className="text-sm text-muted-foreground">The current target ends the day before the new one starts and stays in history.</p>
          </CardHeader>
          <CardContent>
            <TargetForm athleteId={athlete.id} current={current} today={now} />
          </CardContent>
        </Card>
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Target history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {allTargets.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Dates</TableHead>
                    <TableHead>Macros</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allTargets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="pl-4 whitespace-nowrap">
                        {formatDate(t.start_date)} – {t.end_date ? formatDate(t.end_date) : <Badge>Current</Badge>}
                      </TableCell>
                      <TableCell>
                        {t.calories} kcal · P {t.protein_g} · C {t.carbs_g} · F {t.fat_g}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">{t.notes ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No targets yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function MacroBar({ label, value, target, unit }: { label: string; value: number; target?: number; unit: string }) {
  const pct = target ? Math.round((value / target) * 100) : null;
  return (
    <Card>
      <CardContent className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {pct != null && <p className="text-xs text-muted-foreground">{pct}%</p>}
        </div>
        <p className="text-xl font-semibold">
          {Math.round(value)}
          {unit}
          {target != null && (
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / {target}
              {unit}
            </span>
          )}
        </p>
        {pct != null && (
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${label} vs target`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full ${pct > 110 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
