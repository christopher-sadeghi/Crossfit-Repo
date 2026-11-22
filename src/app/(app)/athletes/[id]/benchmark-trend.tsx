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
import type { Enums } from "@/lib/supabase/database.types";

type Point = {
  date: string;
  time_seconds: number | null;
  rounds: number | null;
  reps: number | null;
  load_kg: number | null;
  estimatedOneRmKg: number | null;
  is_rx: boolean;
};
export function BenchmarkTrend({
  points,
  lift,
  workoutType,
  units,
}: {
  points: Point[];
  lift: boolean;
  workoutType: Enums<"workout_type">;
  units: Units;
}) {
  const metrics = workoutType === "strength"
    ? ["load_kg", "rounds", "reps", "time_seconds"] as const
    : workoutType === "for_time"
      ? ["time_seconds", "rounds", "reps", "load_kg"] as const
      : ["rounds", "reps", "load_kg", "time_seconds"] as const;
  const metric = lift ? "estimatedOneRmKg" : metrics.find((key) => points.some((p) => p[key] != null));
  const names = { estimatedOneRmKg: `Est. 1RM (${units})`, load_kg: `Load (${units})`, time_seconds: "Time (seconds)", rounds: "Rounds + reps (shown separately)", reps: "Reps" };
  const lowerIsBetter = metric === "time_seconds";
  const label = metric ? `${names[metric]}; ${lowerIsBetter ? "lower" : "higher"} is better` : "No plottable scores yet";
  const rows = points.map((p) => ({
    ...p,
    value: metric == null || p[metric] == null ? null
      : metric === "estimatedOneRmKg" || metric === "load_kg" ? fromKg(p[metric], units) : p[metric],
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
            <YAxis reversed={lowerIsBetter} tick={{ fontSize: 10 }} width={45} />
            <Tooltip />
            <Line
              dataKey="value"
              name={metric === "rounds" ? "Rounds" : metric ? names[metric] : "Score"}
              stroke="var(--color-primary, #2563eb)"
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
            {metric === "rounds" && points.some((p) => p.reps != null) && (
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
