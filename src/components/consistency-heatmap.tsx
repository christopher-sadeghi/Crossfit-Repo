import type { ConsistencyStats, DayStatus } from "@/lib/consistency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS: Record<DayStatus, { label: string; color: string }> = {
  completed: { label: "Completed", color: "bg-emerald-600" },
  partial: { label: "Partially completed", color: "bg-amber-400" },
  missed: { label: "Missed", color: "bg-rose-500" },
  extra: { label: "Trained on an unscheduled day", color: "bg-sky-500" },
  rest: { label: "Rest day", color: "bg-muted border" },
  pending: { label: "Not started yet", color: "bg-background border-2 border-dashed border-muted-foreground" },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ConsistencyHeatmap({ days }: { days: ConsistencyStats["days"] }) {
  const offset = days.length ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle>Last 90 days</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <div className="overflow-x-auto pb-2">
          <div className="flex w-max gap-2" role="group" aria-label="Training activity for the last 90 days">
            <div className="grid grid-rows-7 gap-1 text-[10px] text-muted-foreground" aria-hidden="true">
              {WEEKDAYS.map((day) => <span key={day} className="h-5 leading-5">{day}</span>)}
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-1">
              {Array.from({ length: offset }, (_, i) => <span key={i} aria-hidden="true" className="size-5" />)}
              {days.map((day) => {
                const label = `${day.date}: ${STATUS[day.status].label}`;
                return <span key={day.date} role="img" aria-label={label} title={label} className={`size-5 rounded-sm ${STATUS[day.status].color}`} />;
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {Object.entries(STATUS).map(([key, status]) => <span key={key} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`size-3 rounded-sm ${status.color}`} />{status.label}</span>)}
        </div>
      </CardContent>
    </Card>
  );
}
