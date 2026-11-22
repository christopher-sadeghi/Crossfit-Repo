import type { AthleteScheduleItem } from "./athlete-schedule";
import type { ConsistencyStats } from "./consistency";
import { monday } from "./program-dates";

export function todaysWorkouts(
  schedules: { athlete: { fullName: string }; schedule: AthleteScheduleItem[] }[],
  today: string,
) {
  const workouts = new Map<string, { item: AthleteScheduleItem; athleteNames: string[] }>();
  for (const { athlete, schedule } of schedules) {
    for (const item of schedule) {
      if (item.date !== today || item.removed) continue;
      const workout = workouts.get(item.workout.id);
      if (workout) workout.athleteNames.push(athlete.fullName);
      else workouts.set(item.workout.id, { item, athleteNames: [athlete.fullName] });
    }
  }
  return [...workouts.values()].sort((a, b) =>
    a.item.workout.title.localeCompare(b.item.workout.title));
}

export function weekCompletion(stats: Pick<ConsistencyStats, "days">[], today: string) {
  const start = monday(today);
  let scheduled = 0;
  let completed = 0;
  for (const { days } of stats) {
    for (const { date, status } of days) {
      if (date < start || date > today || status === "pending" || status === "rest" || status === "extra") continue;
      scheduled++;
      completed += status === "completed" ? 1 : status === "partial" ? 0.5 : 0;
    }
  }
  return scheduled ? Math.round(100 * completed / scheduled) : null;
}
