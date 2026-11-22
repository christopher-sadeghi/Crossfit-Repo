import { FormReviewList } from "@/components/form-reviews/form-review-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadFormReviews } from "@/lib/form-review-data";
import { createClient } from "@/lib/supabase/server";

export async function FormChecksTab({ athleteId }: { athleteId: string }) {
  const reviews = await loadFormReviews(await createClient(), { athleteId });
  return <Card>
    <CardHeader><CardTitle>Form check videos</CardTitle></CardHeader>
    <CardContent><FormReviewList reviews={reviews} hrefBase="/form-checks" empty="This athlete hasn't sent any form videos yet." /></CardContent>
  </Card>;
}
