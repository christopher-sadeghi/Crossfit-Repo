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
  const [{ data: athletes, error: athleteError }, { data: messages, error: messageError }, timeZone] = await Promise.all([
    supabase.from("athletes").select("id, first_name, last_name").eq("coach_id", viewer.id).eq("status", "active").order("first_name"),
    supabase.from("messages").select("athlete_id, body, sender_id, read_at, created_at").eq("coach_id", viewer.id).order("created_at", { ascending: false }),
    getTimeZone(),
  ]);
  if (athleteError || messageError) throw new Error("Couldn't load conversations. Please try again.");
  const latest = new Map<string, NonNullable<typeof messages>[number]>();
  const unread = new Map<string, number>();
  for (const message of messages ?? []) {
    if (!latest.has(message.athlete_id)) latest.set(message.athlete_id, message);
    if (message.sender_id !== viewer.id && !message.read_at) unread.set(message.athlete_id, (unread.get(message.athlete_id) ?? 0) + 1);
  }
  const sorted = [...(athletes ?? [])].sort((a, b) => (latest.get(b.id)?.created_at ?? "").localeCompare(latest.get(a.id)?.created_at ?? ""));
  const formatter = new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <header><h1 className="text-2xl font-semibold tracking-tight">Messages</h1><p className="mt-1 text-sm text-muted-foreground">Stay in touch with your athletes.</p></header>
      <ThreadLive />
      {sorted.length ? <ul className="divide-y rounded-lg border bg-background">
        {sorted.map((athlete) => {
          const last = latest.get(athlete.id);
          const count = unread.get(athlete.id) ?? 0;
          return <li key={athlete.id}><Link href={`/messages/${athlete.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
            <div className="min-w-0 flex-1"><h2 className="font-medium">{athlete.first_name} {athlete.last_name}</h2><p className="truncate text-sm text-muted-foreground">{last?.body ?? "No messages yet · Start a conversation"}</p>{last && <time dateTime={last.created_at} className="text-xs text-muted-foreground">{formatter.format(new Date(last.created_at))}</time>}</div>
            {count > 0 && <span aria-label={`${count} unread messages`} className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{count}</span>}
          </Link></li>;
        })}
      </ul> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No active athletes yet. <Link href="/athletes/new" className="underline">Add an athlete</Link> to start messaging.</p>}
    </div>
  );
}
