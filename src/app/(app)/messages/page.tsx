import Link from "next/link";
import { redirect } from "next/navigation";

import { ThreadLive } from "@/components/messages/thread-live";
import { createClient } from "@/lib/supabase/server";
import { getTimeZone } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export default async function MessagesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "athlete") redirect("/athlete/messages");
  if (viewer.kind === "none") redirect("/no-access");
  const supabase = await createClient();
  const [{ data: athletes, error: athleteError }, timeZone] = await Promise.all([
    supabase.from("athletes").select("id, first_name, last_name").eq("coach_id", viewer.gymId).eq("status", "active").order("first_name"),
    getTimeZone(),
  ]);
  if (athleteError) throw new Error("Couldn't load conversations. Please try again.");
  const summaries = await Promise.all((athletes ?? []).map(async (athlete) => {
    const adjustments = () => supabase.from("ai_suggestions").select("decided_at, created_at, coach_reviewed_at")
      .eq("coach_id", viewer.gymId).eq("athlete_id", athlete.id).eq("suggestion_type", "athlete_adjust_workout").in("status", ["approved", "edited"]);
    const [last, unread, lastAdjustment, unreviewed] = await Promise.all([
      supabase.from("messages").select("body, created_at").eq("athlete_id", athlete.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("athlete_id", athlete.id).neq("sender_id", viewer.id).is("read_at", null),
      adjustments().order("decided_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      adjustments().is("coach_reviewed_at", null).limit(1).maybeSingle(),
    ]);
    if (last.error || unread.error || lastAdjustment.error || unreviewed.error) throw new Error("Couldn't load conversations. Please try again.");
    const adjustmentAt = lastAdjustment.data?.decided_at ?? lastAdjustment.data?.created_at;
    const lastMessageAt = last.data?.created_at;
    const adjustedLast = Boolean(adjustmentAt && (!lastMessageAt || Date.parse(adjustmentAt) > Date.parse(lastMessageAt)));
    return { athlete, last: last.data, unread: unread.count ?? 0, adjustedLast, unreviewed: Boolean(unreviewed.data), activityAt: adjustedLast ? adjustmentAt : lastMessageAt };
  }));
  const sorted = summaries.sort((a, b) => (b.activityAt ? Date.parse(b.activityAt) : 0) - (a.activityAt ? Date.parse(a.activityAt) : 0));
  const formatter = new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <header><h1 className="text-2xl font-semibold tracking-tight">Messages</h1><p className="mt-1 text-sm text-muted-foreground">Stay in touch with your athletes.</p></header>
      <ThreadLive />
      {sorted.length ? <ul className="divide-y rounded-lg border bg-background">
        {sorted.map(({ athlete, last, unread: count, adjustedLast, unreviewed, activityAt }) => {
          return <li key={athlete.id}><Link href={`/messages/${athlete.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
            <div className="min-w-0 flex-1"><h2 className="font-medium">{athlete.first_name} {athlete.last_name}</h2><p className="truncate text-sm text-muted-foreground">{adjustedLast ? "Athlete adjusted a workout" : last?.body ?? "No messages yet · Start a conversation"}</p>{activityAt && <time dateTime={activityAt} className="text-xs text-muted-foreground">{formatter.format(new Date(activityAt))}</time>}</div>
            {unreviewed && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Adjustment to review</span>}
            {count > 0 && <span aria-label={`${count} unread messages`} className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{count}</span>}
          </Link></li>;
        })}
      </ul> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No active athletes yet. <Link href="/athletes/new" className="underline">Add an athlete</Link> to start messaging.</p>}
    </div>
  );
}
