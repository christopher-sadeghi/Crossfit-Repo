"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHECK_IN_LABELS, CHECK_IN_SCALES, isCheckIn, SORENESS_AREAS, readinessLabel, type CheckIn } from "@/lib/check-in";
import type { FormState } from "@/lib/auth/form-state";

import { saveCheckIn, setCheckInSkipped } from "./actions";

export function CheckInForm({ entry, today, initialSkipped = false }: { entry: CheckIn | null; today: string; initialSkipped?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [skipped, setSkipped] = useState(initialSkipped);
  const [skipPending, startSkip] = useTransition();
  const [skipError, setSkipError] = useState<string>();
  const [hours, setHours] = useState(entry?.sleep_hours == null ? "" : String(entry.sleep_hours));
  const [ratings, setRatings] = useState(() =>
    Object.fromEntries(
      Object.keys(CHECK_IN_SCALES).map((key) => [key, entry?.[key as keyof typeof CHECK_IN_SCALES] ?? null]),
    ),
  );
  const [areas, setAreas] = useState(entry?.soreness_areas ?? []);
  const [note, setNote] = useState(entry?.notes ?? "");
  useEffect(() => {
    setSkipped(initialSkipped);
  }, [today, initialSkipped]);
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, data) => {
    const result = await saveCheckIn(previous, data);
    if (!result.error) {
      setSkipped(false);
      setEditing(false);
    }
    return result;
  }, {});
  const hasSavedEntry = entry != null && isCheckIn(entry);
  const summaryItems = entry ? [
    entry.sleep_hours == null ? null : `Sleep ${entry.sleep_hours}h`,
    entry.sleep_quality == null ? null : `Sleep quality ${entry.sleep_quality}/5`,
    entry.soreness == null ? null : `Soreness ${entry.soreness}/5`,
    entry.stress == null ? null : `Stress ${entry.stress}/5`,
    entry.energy == null ? null : `Energy ${entry.energy}/5`,
    entry.mood == null ? null : `Mood ${entry.mood}/5`,
  ].filter((item): item is string => item !== null) : [];
  const showSkipped = skipped && !hasSavedEntry && !editing;
  const showPrompt = !hasSavedEntry && !showSkipped && !editing;
  const changeSkip = (value: boolean) => {
    setSkipError(undefined);
    startSkip(async () => {
      try {
        const result = await setCheckInSkipped(today, value);
        if (result.error) {
          setSkipError(result.error);
          return;
        }
        setSkipped(value);
        setEditing(!value);
      } catch {
        setSkipError("Couldn't update today's skip. Please try again.");
      }
    });
  };
  const skipToday = () => changeSkip(true);
  const fillItIn = () => changeSkip(false);
  const editToday = fillItIn;

  return (
    <Card>
      {showSkipped ? (
        <CardContent className="flex items-center gap-2 py-4 text-sm">
          <span className="sr-only">Daily check-in (optional)</span>
          <span>Check-in skipped today</span>
          <span aria-hidden="true">·</span>
          <Button type="button" disabled={pending || skipPending} variant="ghost" className="h-auto px-0 text-primary underline underline-offset-4" onClick={fillItIn}>
            Fill it in
          </Button>
        </CardContent>
      ) : showPrompt ? (
        <>
          <CardHeader className="pb-2">
            <CardTitle>Daily check-in (optional)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">How are you feeling today? Takes about 30 seconds.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending || skipPending} onClick={fillItIn}>
                Fill it in
              </Button>
              <Button type="button" disabled={pending || skipPending} variant="outline" onClick={skipToday}>
                Skip today
              </Button>
            </div>
          </CardContent>
        </>
      ) : (
        <>
          <CardHeader>
            <CardTitle>Daily check-in (optional)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {entry && isCheckIn(entry) && !editing ? (
              <>
                {entry.readiness == null ? (
                  <p className="text-sm text-muted-foreground">Readiness: answer all six to get a score</p>
                ) : (
                  <p className="text-2xl font-semibold">
                    {entry.readiness}/100 · {readinessLabel(entry.readiness)}
                  </p>
                )}
                {summaryItems.length > 0 && (
                  <p className="text-sm text-muted-foreground">{summaryItems.join(" · ")}</p>
                )}
                {entry.soreness_areas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.soreness_areas.map((area) => (
                      <Badge key={area} variant="secondary">
                        {area}
                      </Badge>
                    ))}
                  </div>
                )}
                {entry.notes && <p className="whitespace-pre-wrap text-sm">{entry.notes}</p>}
                <Button disabled={pending || skipPending} variant="outline" onClick={editToday}>
                  Edit today&apos;s check-in
                </Button>
              </>
            ) : (
              <form action={action} className="grid gap-4">
                <input type="hidden" name="expected_date" value={today} />
                <div className="grid gap-1.5">
                  <Label htmlFor="check_in_sleep_hours">Sleep (h)</Label>
                  <Input
                    id="check_in_sleep_hours"
                    className="min-h-11"
                    type="number"
                    name="sleep_hours"
                    min={0}
                    max={24}
                    step={0.1}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
                {Object.entries(CHECK_IN_SCALES).map(([key, labels]) => (
                  <fieldset key={key} className="grid gap-1.5">
                    <legend className="mb-1 text-sm font-medium">
                      {CHECK_IN_LABELS[key as keyof typeof CHECK_IN_SCALES]}
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {labels.map((label, i) => (
                        <Label key={label} className="cursor-pointer">
                          <input
                            className="peer sr-only"
                            type="radio"
                            name={key}
                            value={i + 1}
                            checked={ratings[key] === i + 1}
                            onChange={() => setRatings((previous) => ({ ...previous, [key]: i + 1 }))}
                          />
                          <span className="flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                            {i + 1} · {label}
                          </span>
                        </Label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <fieldset className="grid gap-1.5">
                  <legend className="mb-1 text-sm font-medium">Sore areas (optional, up to 12)</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {SORENESS_AREAS.map((area) => (
                      <Label key={area} className="cursor-pointer">
                        <input
                          className="peer sr-only"
                          type="checkbox"
                          name="soreness_areas"
                          value={area}
                          checked={areas.includes(area)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAreas((previous) =>
                              checked ? [...previous, area] : previous.filter((value) => value !== area),
                            );
                          }}
                        />
                        <span className="flex min-h-11 items-center rounded-md border px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                          {area}
                        </span>
                      </Label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-1.5">
                  <Label htmlFor="check_in_notes">Note (optional)</Label>
                  <Textarea
                    id="check_in_notes"
                    name="notes"
                    maxLength={500}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending || skipPending}>{pending ? "Saving…" : "Save check-in"}</Button>
                  {!hasSavedEntry && (
                    <Button type="button" disabled={pending || skipPending} variant="outline" onClick={skipToday}>
                      Skip today
                    </Button>
                  )}
                </div>
              </form>
            )}
            {state.message && <p role="status" className="text-sm">{state.message}</p>}
            <Link href="/athlete/journal" className="text-sm text-muted-foreground underline">
              Journal habits
            </Link>
          </CardContent>
        </>
      )}
      {skipError && <CardContent><p role="alert" className="text-sm text-destructive">{skipError}</p></CardContent>}
    </Card>
  );
}
