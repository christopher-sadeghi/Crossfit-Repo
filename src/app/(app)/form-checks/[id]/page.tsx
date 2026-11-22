import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { FormReviewPlayer } from "@/components/form-reviews/form-review-player";
import { loadFormReview } from "@/lib/form-review-data";
import { formReviewLabel } from "@/lib/form-reviews";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

export default async function CoachFormCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer?.kind !== "coach") redirect("/login");
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await loadFormReview(await createClient(), id);
  if (!data || data.review.coach_id !== viewer.gymId) notFound();
  const { review } = data;
  return <div className="grid min-w-0 gap-4">
    <Link href="/form-checks" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Form checks</Link>
    <header>
      <h1 className="text-xl font-semibold tracking-tight">{formReviewLabel(review)}</h1>
      <p className="text-sm text-muted-foreground">
        {review.athlete && <><Link href={`/athletes/${review.athlete_id}?tab=form`} className="font-medium text-foreground hover:underline">{review.athlete.first_name} {review.athlete.last_name}</Link> · </>}
        Recorded {formatDate(review.recorded_on)}
        {review.result && <> · <Link href={`/programs/workouts/${review.result.workout_id}`} className="hover:underline">{review.result.workouts?.title ?? "Workout"} result ({formatDate(review.result.performed_on)})</Link></>}
      </p>
    </header>
    <FormReviewPlayer data={data} role="coach" userId={viewer.id} backHref="/form-checks" />
  </div>;
}
