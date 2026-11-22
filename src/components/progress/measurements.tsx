"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { deleteMeasurement, saveMeasurements } from "@/app/progress-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MEASUREMENT_SITES, SITE_LABELS, measurementTrend, type Measurement, type MeasurementValue } from "@/lib/measurements";
import { formatDate, fromCm, lengthUnit, type Units } from "@/lib/units";

import { ActionFeedback, useProgressAction } from "./action-feedback";

type Props = { measurements: Measurement[]; units: Units };
const selectClass = "h-10 rounded-md border bg-background px-3 text-sm";
const delta = (value: number | null, unit: string) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)} ${unit}`;

export function MeasurementChart({ measurements, units, measurementTrendRows }: Props & { measurementTrendRows: MeasurementValue[] }) {
  const [site, setSite] = useState<(typeof MEASUREMENT_SITES)[number]>("waist");
  const unit = lengthUnit(units);
  const trend = measurementTrend(measurementTrendRows, site, units);
  const points = measurements.filter((row) => row.site === site).sort((a, b) => a.measured_on.localeCompare(b.measured_on))
    .map((row) => ({ date: row.measured_on, value: fromCm(Number(row.value_cm), units) }));
  return <Card className="min-w-0">
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Body measurements</CardTitle>
        <select aria-label="Chart measurement site" className={selectClass} value={site} onChange={(event) => setSite(event.target.value as typeof site)}>
          {MEASUREMENT_SITES.map((key) => <option key={key} value={key}>{SITE_LABELS[key]}</option>)}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">Small changes, seen over time · {unit === "in" ? "inches" : "centimeters"}</p>
    </CardHeader>
    <CardContent>
      {trend ? <>
        <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
          <div><p className="text-xs text-muted-foreground">Latest</p><p className="text-xl font-semibold">{trend.latest.toFixed(1)} <span className="text-sm font-normal">{unit}</span></p></div>
          <div><p className="text-xs text-muted-foreground">Since first</p><p className="mt-1 font-medium">{delta(trend.sinceFirst, unit)}</p></div>
          <div><p className="text-xs text-muted-foreground">Since previous</p><p className="mt-1 font-medium">{delta(trend.sincePrevious, unit)}</p></div>
        </div>
        <div role="img" aria-label={`${SITE_LABELS[site]} measurements over time in ${unit}`} className="h-52 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(date: string) => formatDate(date).replace(/, \d{4}/, "")} tick={{ fontSize: 11 }} minTickGap={30} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(date) => formatDate(String(date))} formatter={(value) => [`${value} ${unit}`, SITE_LABELS[site]]} contentStyle={{ borderRadius: 10, background: "var(--card)", borderColor: "var(--border)" }} />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </> : <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><p>No {SITE_LABELS[site].toLowerCase()} measurements yet.</p><p>Log your first check-in below to see your trend.</p></div>}
    </CardContent>
  </Card>;
}

export function MeasurementLog({ athleteId, today, measurements, units }: Props & { athleteId: string; today: string }) {
  const [date, setDate] = useState(today);
  const { result, pending, run } = useProgressAction();
  const unit = lengthUnit(units);
  return <Card className="min-w-0">
    <CardHeader><CardTitle>Log measurements</CardTitle><p className="text-sm text-muted-foreground">Use a relaxed tape, in the same place each time. Fill in any sites.</p></CardHeader>
    <CardContent className="space-y-5">
      <form onSubmit={(event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
        run(() => saveMeasurements(athleteId, date, values));
      }} className="space-y-4">
        <label className="grid gap-1.5 text-sm font-medium">Measurement date<Input type="date" required max={today} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <fieldset key={date + measurements.filter((row) => row.measured_on === date).map((row) => row.value_cm).join(",")} disabled={pending} className="grid grid-cols-2 gap-3">
          {MEASUREMENT_SITES.map((site) => {
            const row = measurements.find((row) => row.site === site && row.measured_on === date);
            return <label key={site} className="grid gap-1.5 text-sm">{SITE_LABELS[site]} ({unit})<Input name={site} type="number" inputMode="decimal" min="0.1" max={unit === "in" ? "157.4" : "399.9"} step="0.1" placeholder="—" defaultValue={row ? fromCm(Number(row.value_cm), units) : ""} /></label>;
          })}
        </fieldset>
        <p className="text-xs text-muted-foreground">Saving the same date updates those sites. Blank fields leave other entries unchanged.</p>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? "Saving…" : "Save measurements"}</Button>
      </form>
      <ActionFeedback result={result} />
      <details className="border-t pt-4">
        <summary className="cursor-pointer text-sm font-medium">Measurement history ({measurements.length})</summary>
        {measurements.length ? <div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-xs">
          <thead><tr className="border-b text-muted-foreground"><th className="py-2">Date</th><th>Site</th><th>Value</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{[...measurements].reverse().map((row) => <tr key={row.id} className="border-b">
            <td className="py-3">{formatDate(row.measured_on)}</td><td>{SITE_LABELS[row.site as keyof typeof SITE_LABELS] ?? row.site}</td><td className="whitespace-nowrap">{fromCm(Number(row.value_cm), units).toFixed(1)} {unit}</td>
            <td><button type="button" disabled={pending} className="min-h-10 px-2 text-destructive disabled:opacity-50" aria-label={`Delete ${row.site} measurement on ${row.measured_on}`} onClick={() => {
              if (confirm("Delete this measurement?")) run(() => deleteMeasurement(athleteId, row.id));
            }}>Delete</button></td>
          </tr>)}</tbody>
        </table></div> : <p className="mt-3 text-sm text-muted-foreground">Your measurements will appear here.</p>}
      </details>
    </CardContent>
  </Card>;
}
