import { checkInAttention, readinessLabel, type CheckIn } from "@/lib/check-in";
import { addDays } from "@/lib/nutrition";

const METRICS = ["readiness", "sleep_hours", "soreness", "stress", "energy", "mood"] as const;
function average(entries: CheckIn[], key: typeof METRICS[number]) {
  const values = entries.flatMap((e) => e[key] == null ? [] : [Number(e[key])]);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;
}
export function CheckInsTab({ entries, today }: { entries: CheckIn[]; today: string }) {
  const sorted = entries.filter((e) => e.entry_on <= today).sort((a, b) => b.entry_on.localeCompare(a.entry_on));
  const attention = checkInAttention(sorted, today);
  const latest = sorted.find((e) => e.readiness != null);
  const last28 = sorted.filter((e) => e.entry_on >= addDays(today, -27));
  const areas = new Map<string, number>();
  for (const e of last28) for (const area of new Set(e.soreness_areas)) areas.set(area, (areas.get(area) ?? 0) + 1);
  return <div className="grid gap-6">
    {attention.flagged && <div role="status" className="rounded-lg border border-amber-500 p-4"><h3 className="font-semibold">Needs attention</h3>{attention.reasons.map((r) => <p key={r}>{r}</p>)}</div>}
    <h3 className="text-lg font-semibold">Latest readiness: {latest ? `${latest.readiness}/100 · ${readinessLabel(latest.readiness)} (${latest.entry_on})` : "No complete check-in yet"}</h3>
    {[7, 28].map((days) => {
      const current = sorted.filter((e) => e.entry_on >= addDays(today, 1 - days));
      const previous = sorted.filter((e) => e.entry_on < addDays(today, 1 - days) && e.entry_on >= addDays(today, 1 - days * 2));
      return <section key={days}><h3 className="mb-2 font-semibold">{days}-day averages vs previous {days} days</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{METRICS.map((key) => {
          const now = average(current, key), before = average(previous, key);
          return <div key={key} className="rounded-lg border p-3"><p className="capitalize">{key.replace("_", " ")}</p><p>{now ?? "—"} <span className="text-sm text-muted-foreground">{now != null && before != null ? `${now > before ? "↑" : now < before ? "↓" : "→"} vs ${before}` : "No comparison"}</span></p></div>;
        })}</div>
      </section>;
    })}
    <section><h3 className="mb-2 font-semibold">Readiness · last 28 days</h3><div className="flex h-40 items-end gap-1" role="img" aria-label="Daily readiness scores for the last 28 days">
      {Array.from({ length: 28 }, (_, i) => {
        const date = addDays(today, i - 27), entry = last28.find((e) => e.entry_on === date);
        return <div key={date} className="flex h-full flex-1 items-end" title={`${date}: ${entry?.readiness ?? "No score"}`}><div className={entry?.readiness != null ? "w-full rounded-t bg-primary" : "w-full bg-muted"} style={{ height: entry?.readiness == null ? "2px" : `${entry.readiness}%` }} /></div>;
      })}</div><p className="text-xs text-muted-foreground">{addDays(today, -27)} — {today} · hover bars for scores</p></section>
    <section><h3 className="font-semibold">Top sore areas · last 28 days</h3><p className="text-sm">{[...areas].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([area, n]) => `${area} (${n})`).join(" · ") || "No sore areas reported"}</p></section>
    <section className="overflow-x-auto"><h3 className="mb-2 font-semibold">Check-in history</h3><table className="w-full text-left text-sm"><thead><tr>{["Date", "Readiness", "Sleep", "Quality", "Soreness", "Areas", "Stress", "Energy", "Mood", "Note"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
      {sorted.map((e) => <tr key={e.entry_on} className="border-t">{[e.entry_on, e.readiness, e.sleep_hours == null ? null : `${e.sleep_hours}h`, e.sleep_quality, e.soreness, e.soreness_areas.join(", "), e.stress, e.energy, e.mood, e.notes].map((v, i) => <td key={i} className="p-2">{v ?? "—"}</td>)}</tr>)}
    </tbody></table>{!sorted.length && <p className="p-2 text-sm text-muted-foreground">No check-ins yet.</p>}</section>
  </div>;
}
