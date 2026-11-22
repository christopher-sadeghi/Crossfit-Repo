import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOURNAL_COLUMNS, JOURNAL_LOOKBACK_DAYS, journalSleepSummary, journalYesAnswers } from "@/lib/journal";
import { getToday } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

import { JournalForm } from "./journal-form";

export default async function AthleteJournalPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const todayIso = await getToday();
  const earliest = new Date(`${todayIso}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - JOURNAL_LOOKBACK_DAYS);
  const earliestIso = earliest.toISOString().slice(0, 10);
  const entryOn =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= earliestIso && date <= todayIso
      ? date
      : todayIso;

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("athlete_journal_entries")
    .select(JOURNAL_COLUMNS)
    .eq("athlete_id", viewer.athleteId)
    .gte("entry_on", earliestIso)
    .order("entry_on", { ascending: false });
  const entry = (entries ?? []).find((e) => e.entry_on === entryOn) ?? null;
  const past = (entries ?? []).filter((e) => e.entry_on !== entryOn);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Daily journal</h1>
          <p className="text-sm text-muted-foreground">
            {entryOn === todayIso ? "Today" : formatDate(entryOn)} · optional, helps your coach spot patterns
          </p>
          <Link href="/athlete" className="text-sm text-muted-foreground underline">Sleep, recovery ratings and notes are in today&apos;s daily check-in.</Link>
        </div>
        <Card>
          <CardContent className="pt-6">
            <JournalForm
              key={entryOn}
              entryOn={entryOn}
              entry={entry}
              habitsLegend={
                entryOn === todayIso
                  ? "Yesterday and today, did you…"
                  : `On ${formatDate(entryOn)} and the day before, did you…`
              }
            />
          </CardContent>
        </Card>
        <form action="/athlete/journal" className="flex items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="journal_date">Fill in another day</Label>
            <Input id="journal_date" name="date" type="date" min={earliestIso} max={todayIso} defaultValue={entryOn} required />
          </div>
          <Button type="submit" variant="outline">
            Open
          </Button>
          {entryOn !== todayIso && (
            <Button asChild variant="ghost">
              <Link href="/athlete/journal">Today</Link>
            </Button>
          )}
        </form>
      </section>

      {past.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Recent entries</h2>
          {past.map((e) => {
            const yes = journalYesAnswers(e);
            return (
              <Card key={e.entry_on}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                  <CardTitle className="text-sm">{formatDate(e.entry_on)}</CardTitle>
                  <Link href={`/athlete/journal?date=${e.entry_on}`} className="text-sm text-muted-foreground hover:text-foreground">
                    Edit
                  </Link>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  {journalSleepSummary(e) && <p>{journalSleepSummary(e)}</p>}
                  {yes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {yes.map((label) => (
                        <Badge key={label} variant="secondary">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {e.notes && <p className="text-muted-foreground">{e.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
