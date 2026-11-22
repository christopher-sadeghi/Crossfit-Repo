import { ActivityForm } from "@/components/activity-form";
import { DeleteActivityButton } from "@/components/delete-activity-button";
import { activityLabel, distanceUnit, fromActivityMeters, type AthleteActivity } from "@/lib/athlete-activities";
import { sessionLoad } from "@/lib/training-load";
import { formatDate, type Units } from "@/lib/units";

type Props = { activities: AthleteActivity[]; today: string; units: Units };

export function ActivityList({ activities, today, units }: Props) {
  if (!activities.length) return <p className="text-sm text-muted-foreground">No outside activities logged.</p>;
  return (
    <ul className="grid gap-2">
      {activities.map((activity) => (
        <li key={activity.id} className="grid gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="break-words font-medium">{activityLabel(activity)}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(activity.performed_on)} · {activity.duration_minutes} min · RPE {activity.rpe}
                {activity.distance_m != null && ` · ${fromActivityMeters(activity.distance_m, units).toLocaleString(undefined, { maximumSignificantDigits: 3 })} ${distanceUnit(units)}`}
              </p>
            </div>
            <span className="text-sm font-medium">{sessionLoad(activity.duration_minutes, activity.rpe)} load</span>
          </div>
          {activity.notes && <p className="whitespace-pre-line break-words text-sm">{activity.notes}</p>}
          <details>
            <summary className="w-fit cursor-pointer text-sm underline underline-offset-4">Edit activity</summary>
            <div className="mt-3 grid gap-3">
              <ActivityForm key={activity.updated_at} athleteId={activity.athlete_id} today={today} units={units} activity={activity} />
              <DeleteActivityButton athleteId={activity.athlete_id} activityId={activity.id} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
