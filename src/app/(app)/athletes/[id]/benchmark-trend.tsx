"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fromKg, type Units } from "@/lib/units";

type Point = {
  date: string;
  time_seconds: number | null;
  rounds: number | null;
  reps: number | null;
  estimatedOneRmKg: number | null;
  is_rx: boolean;
};
export function BenchmarkTrend({
  points,
  lift,
  forTime,
  units,
}: {
  points: Point[];
  lift: boolean;
  forTime: boolean;
  units: Units;
}) {
  const label = lift
    ? `Estimated 1RM (${units}); higher is better`
    : forTime
      ? "Time (seconds); lower is better"
      : "Rounds + reps (shown separately); higher is better";
  const rows = points.map((p) => ({
    ...p,
    value: lift
      ? p.estimatedOneRmKg == null
        ? null
        : fromKg(p.estimatedOneRmKg, units)
      : forTime
        ? p.time_seconds
        : (p.rounds ?? 0),
    classification: p.is_rx ? "Rx" : "Scaled",
  }));
  return (
    <div
      className="min-w-0"
      role="img"
      aria-label={`Attempt trend: ${label}. Exact scores and Rx or scaled classification are listed below.`}
    >
      <p className="mb-2 text-xs text-muted-foreground">
        {label}. Rx and scaled attempts included.
      </p>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} />
            <YAxis reversed={forTime} tick={{ fontSize: 10 }} width={45} />
            <Tooltip />
            <Line
              dataKey="value"
              name={
                lift ? `Est. 1RM (${units})` : forTime ? "Seconds" : "Rounds"
              }
              stroke="var(--color-primary, #2563eb)"
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
            {!lift && !forTime && (
              <Line
                dataKey="reps"
                name="Additional reps"
                stroke="#d97706"
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
