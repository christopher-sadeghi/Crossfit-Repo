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

export default async function AthleteFormCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer?.kind !== "athlete") redirect("/login");
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [data, { data: claims }] = await Promise.all([loadFormReview(supabase, id), supabase.auth.getClaims()]);
  if (!data || data.review.athlete_id !== viewer.athleteId) notFound();
  return <div className="grid min-w-0 gap-4">
    <Link href="/athlete/form-checks" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Form checks</Link>
    <header>
      <h1 className="text-xl font-semibold tracking-tight">{formReviewLabel(data.review)}</h1>
      <p className="text-sm text-muted-foreground">Recorded {formatDate(data.review.recorded_on)}</p>
    </header>
    <FormReviewPlayer data={data} role="athlete" userId={String(claims?.claims?.sub ?? "")} backHref="/athlete/form-checks" />
  </div>;
}
