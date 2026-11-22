import { redirect } from "next/navigation";

import { MeasurementChart, MeasurementLog } from "@/components/progress/measurements";
import { ProgressPhotos } from "@/components/progress/progress-photos";
import { loadProgressCheckIns } from "@/lib/measurements";
import { progressAccess } from "@/lib/progress-access";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export default async function AthleteProgressPage() {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") redirect("/login");
  const { supabase, athlete } = await progressAccess(viewer.athleteId);
  const [{ measurements, photos }, today] = await Promise.all([loadProgressCheckIns(supabase, athlete.id), getToday()]);
  return <div className="grid min-w-0 gap-5">
    <header><p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Your journey</p><h1 className="text-2xl font-semibold tracking-tight">Progress</h1><p className="mt-2 text-sm text-muted-foreground">More than a number. Notice the changes, at your own pace.</p></header>
    <ProgressPhotos athleteId={athlete.id} coachId={athlete.coach_id} today={today} measurements={measurements} photos={photos} />
    <MeasurementChart measurements={measurements} units={viewer.units} />
    <MeasurementLog athleteId={athlete.id} today={today} measurements={measurements} units={viewer.units} />
  </div>;
}
