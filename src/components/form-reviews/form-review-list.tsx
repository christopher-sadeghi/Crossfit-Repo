import { MessageSquare, Video } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formReviewLabel, formatTimestamp } from "@/lib/form-reviews";
import type { FormReviewSummary } from "@/lib/form-review-data";
import { formatDate } from "@/lib/units";

export function FormReviewList({ reviews, hrefBase, showAthlete = false, empty }: {
  reviews: FormReviewSummary[]; hrefBase: string; showAthlete?: boolean; empty: string;
}) {
  if (!reviews.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <ul className="grid gap-2">
    {reviews.map((review) => <li key={review.id}>
      <Link href={`${hrefBase}/${review.id}`} className="flex min-w-0 items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50">
        <Video className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {showAthlete && review.athlete && <span className="font-medium">{review.athlete.first_name} {review.athlete.last_name}</span>}
            <span className={showAthlete ? "text-muted-foreground" : "font-medium"}>{formReviewLabel(review)}</span>
          </div>
          {review.question && <p className="truncate text-muted-foreground">&ldquo;{review.question}&rdquo;</p>}
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>{formatDate(review.recorded_on)}</span>
            <span>{formatTimestamp(review.duration_seconds)}</span>
            <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{review.comment_count}</span>
          </p>
        </div>
        <Badge variant={review.status === "reviewed" ? "secondary" : "default"} className="shrink-0">{review.status === "reviewed" ? "Reviewed" : "Awaiting review"}</Badge>
      </Link>
    </li>)}
  </ul>;
}
