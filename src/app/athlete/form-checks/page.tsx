import { redirect } from "next/navigation";

import { FormReviewList } from "@/components/form-reviews/form-review-list";
import { FormVideoUpload } from "@/components/form-reviews/form-video-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadFormReviews } from "@/lib/form-review-data";
import { progressAccess } from "@/lib/progress-access";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export default async function AthleteFormChecksPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") redirect("/login");
  const { supabase, athlete } = await progressAccess(viewer.athleteId);
  const [{ result }, today, reviews, { data: results }, { data: movements }] = await Promise.all([
    searchParams,
    getToday(),
    loadFormReviews(supabase, { athleteId: athlete.id }),
    supabase.from("workout_results").select("id, performed_on, workouts(title)").eq("athlete_id", athlete.id)
      .order("performed_on", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    supabase.from("movements").select("id, name").order("name").limit(500),
  ]);
  return <div className="grid min-w-0 gap-5">
    <header>
      <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Technique</p>
      <h1 className="text-2xl font-semibold tracking-tight">Form checks</h1>
      <p className="mt-2 text-sm text-muted-foreground">Send your coach a short clip. They&apos;ll pin feedback to the exact moments that matter.</p>
    </header>
    <Card>
      <CardHeader><CardTitle>Send a video</CardTitle></CardHeader>
      <CardContent>
        <FormVideoUpload
          athleteId={athlete.id} coachId={athlete.coach_id} today={today} defaultResultId={result}
          results={(results ?? []).map((row) => ({ id: row.id, performed_on: row.performed_on, title: row.workouts?.title ?? "Workout" }))}
          movements={movements ?? []}
        />
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Your videos</CardTitle></CardHeader>
      <CardContent><FormReviewList reviews={reviews} hrefBase="/athlete/form-checks" empty="No videos yet. Your first one will appear here." /></CardContent>
    </Card>
  </div>;
}
