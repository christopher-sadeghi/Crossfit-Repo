"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const LINE = "var(--primary)";
const ACCENT = "oklch(0.62 0.17 255)";
const AXIS = { fontSize: 12, stroke: "var(--muted-foreground)" };
const TOOLTIP = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "var(--foreground)" },
};

function Frame({ children, label }: { children: React.ReactElement; label: string }) {
  return (
    <div role="img" aria-label={label} className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function WeightChart({ data, units }: { data: { date: string; weight: number | null; bodyFat: number | null }[]; units: string }) {
  const hasFat = data.some((d) => d.bodyFat != null);
  return (
    <Frame label={`Body weight over time in ${units}`}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={AXIS} />
        <YAxis yAxisId="w" tick={AXIS} domain={["auto", "auto"]} unit={` ${units}`} width={64} />
        {hasFat && <YAxis yAxisId="f" orientation="right" tick={AXIS} domain={["auto", "auto"]} unit="%" width={44} />}
        <Tooltip {...TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="w" type="monotone" dataKey="weight" name={`Weight (${units})`} stroke={LINE} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        {hasFat && <Line yAxisId="f" type="monotone" dataKey="bodyFat" name="Body fat %" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} connectNulls />}
      </LineChart>
    </Frame>
  );
}

export function PrChart({ data, units }: { data: { movement: string; load: number }[]; units: string }) {
  return (
    <Frame label={`Heaviest load per movement in ${units}`}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={AXIS} unit={` ${units}`} />
        <YAxis type="category" dataKey="movement" tick={AXIS} width={110} />
        <Tooltip {...TOOLTIP} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="load" name={`Best load (${units})`} fill={LINE} radius={[0, 4, 4, 0]} />
      </BarChart>
    </Frame>
  );
}

export function MacroChart({ data, label, unit }: { data: { date: string; intake: number | null; target: number | null }[]; label: string; unit: string }) {
  return (
    <Frame label={`Daily ${label.toLowerCase()} against target`}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={AXIS} interval="preserveStartEnd" />
        <YAxis tick={AXIS} unit={unit} width={64} />
        <Tooltip {...TOOLTIP} cursor={{ fill: "var(--muted)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="intake" name={`${label} eaten`} fill={ACCENT} radius={[3, 3, 0, 0]} />
        <Line type="stepAfter" dataKey="target" name="Target" stroke={LINE} strokeWidth={2} dot={false} connectNulls={false} />
      </ComposedChart>
    </Frame>
  );
}
