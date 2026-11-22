import { redirect } from "next/navigation";

import { FormReviewList } from "@/components/form-reviews/form-review-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadFormReviews } from "@/lib/form-review-data";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export default async function FormChecksPage() {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") redirect("/login");
  const reviews = await loadFormReviews(await createClient(), { coachId: viewer.gymId });
  const awaiting = reviews.filter((review) => review.status === "awaiting_review");
  const reviewed = reviews.filter((review) => review.status === "reviewed");
  return <div className="grid min-w-0 gap-5">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">Form checks</h1>
      <p className="mt-1 text-sm text-muted-foreground">Videos your athletes sent for technique feedback. Oldest unreviewed first.</p>
    </header>
    <Card>
      <CardHeader><CardTitle>Awaiting review ({awaiting.length})</CardTitle></CardHeader>
      <CardContent><FormReviewList reviews={awaiting} hrefBase="/form-checks" showAthlete empty="You're all caught up." /></CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Reviewed</CardTitle></CardHeader>
      <CardContent><FormReviewList reviews={reviewed} hrefBase="/form-checks" showAthlete empty="Reviewed videos will appear here." /></CardContent>
    </Card>
  </div>;
}
