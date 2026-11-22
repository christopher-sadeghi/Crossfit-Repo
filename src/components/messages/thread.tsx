import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AskAI } from "@/components/messages/ask-ai";
import { InlineSuggestionCard } from "@/components/suggestions/inline-suggestion-card";
import { AthleteAdjustmentCard } from "@/components/suggestions/athlete-adjustment-card";
import { inlineSuggestion } from "@/lib/ai/inline-suggestion";
import { threadSourceMessageId } from "@/lib/ai/thread-source";
import type { Tables } from "@/lib/supabase/database.types";
import { MessageComposer } from "@/components/messages/composer";
import { ThreadLive } from "@/components/messages/thread-live";
import { messageAthlete, messageLinkOptions, parseMessageLink, resolveMessageLinks, validateMessageLink, type MessageLink } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { getTimeZone, getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export async function MessageThread({ athleteId: requestedAthleteId, requestedLink }: { athleteId?: string; requestedLink?: string }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "none") redirect("/no-access");
  const isCoach = viewer.kind === "coach";
  if (isCoach && !requestedAthleteId) redirect("/messages");
  if (!isCoach && requestedAthleteId) redirect("/athlete/messages");
  const athleteId = requestedAthleteId ?? (viewer.kind === "athlete" ? viewer.athleteId : "");
  const supabase = await createClient();
  const athlete = await messageAthlete(supabase, viewer, athleteId);
  if (!athlete) notFound();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");
  const [{ data: coach }, { data: messages, error }, { count: unreadCount, error: unreadError }, { data: coachSuggestions, error: suggestionsError }, today, timeZone] = await Promise.all([
    supabase.from("coaches").select("full_name").eq("id", athlete.coach_id).maybeSingle(),
    supabase.from("messages").select("*").eq("athlete_id", athleteId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("athlete_id", athleteId).neq("sender_id", userId).is("read_at", null),
    viewer.kind === "coach" ? supabase.from("ai_suggestions").select("*")
      .eq("coach_id", viewer.id).eq("athlete_id", athleteId)
      .or("suggestion_type.eq.athlete_adjust_workout,input->>source_message_id.not.is.null")
      .order("created_at", { ascending: true }).order("id") : { data: null, error: null },
    getToday(), getTimeZone(),
  ]);
  if (error || unreadError || suggestionsError) throw new Error("Couldn't load your messages. Please try again.");
  const athleteName = `${athlete.first_name} ${athlete.last_name}`;
  const coachName = coach?.full_name || "Coach";
  const rows = [...(messages ?? [])].reverse();
  const visibleMessageIds = new Set(rows.map(({ id }) => id));
  const cardsByMessage = new Map<string, Tables<"ai_suggestions">[]>();
  const standaloneCards: Tables<"ai_suggestions">[] = [];
  for (const suggestion of coachSuggestions ?? []) {
    const source = threadSourceMessageId(suggestion.input);
    if (source && visibleMessageIds.has(source)) {
      const cards = cardsByMessage.get(source) ?? [];
      cards.push(suggestion);
      cardsByMessage.set(source, cards);
    } else {
      standaloneCards.push(suggestion);
    }
  }
  const links = rows.flatMap((row) => row.link_type && row.link_id ? [{ type: row.link_type as MessageLink["type"], id: row.link_id }] : []);
  const [resolved, options] = await Promise.all([
    resolveMessageLinks(supabase, athleteId, links, isCoach),
    messageLinkOptions(supabase, athleteId, today, isCoach),
  ]);
  let initialLink = "";
  const prefill = requestedLink ? parseMessageLink(requestedLink) : null;
  if (prefill && await validateMessageLink(supabase, athleteId, prefill, isCoach)) {
    const prefilled = (await resolveMessageLinks(supabase, athleteId, [prefill], isCoach)).get(`${prefill.type}:${prefill.id}`);
    if (prefilled) {
      initialLink = `${prefill.type}:${prefill.id}`;
      if (!options.some((option) => option.type === prefill.type && option.id === prefill.id)) options.push({ ...prefilled, label: prefilled.type === "suggestion" ? `${prefilled.label} (only you can open this)` : prefilled.label });
    }
  }
  const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const timeFormat = new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" });
  const dayFormat = new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium" });
  const unreadKey = unreadCount ? String(unreadCount) : "";

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <header>
        {isCoach && <Link href="/messages" className="mb-3 inline-block text-sm text-muted-foreground hover:underline">← All messages</Link>}
        <h1 className="text-2xl font-semibold tracking-tight">{isCoach ? athleteName : coachName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Private coach–athlete messages · updates every 10 seconds</p>
        {isCoach && !athlete.user_id && <p className="mt-2 text-sm text-muted-foreground">This athlete has not joined yet. They can read your messages once they create an account.</p>}
      </header>
      <ThreadLive athleteId={athleteId} unreadKey={unreadKey} />
      <ol aria-label="Conversation" className="grid gap-3">
        {!rows.length && <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No messages yet. Start the conversation below.</li>}
        {rows.map((row, index) => {
          const mine = row.sender_id === userId;
          const date = new Date(row.created_at);
          const day = dateFormat.format(date);
          const previousDay = index ? dateFormat.format(new Date(rows[index - 1].created_at)) : null;
          const linked = row.link_type && row.link_id ? resolved.get(`${row.link_type}:${row.link_id}`) : null;
          return (
            <li key={row.id} className="grid gap-3">
              {day !== previousDay && <p className="text-center text-xs text-muted-foreground">{day === today ? "Today" : dayFormat.format(date)}</p>}
              <article className={`max-w-[90%] rounded-xl px-4 py-3 ${mine ? "justify-self-end bg-primary text-primary-foreground" : "justify-self-start border bg-background"}`}>
                <p className="mb-1 text-xs opacity-75">{mine ? "You" : row.sender_id === athlete.coach_id ? coachName : athleteName}</p>
                <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{row.body}</p>
                {row.link_type && (row.link_type === "suggestion" && !isCoach ? <p className="mt-2 text-xs opacity-75">AI suggestion (your coach is reviewing it)</p> : linked ? <Link href={linked.href} className="mt-2 block break-words text-sm underline underline-offset-4">{linked.label}</Link> : <p className="mt-2 text-xs opacity-75">Linked item unavailable</p>)}
                <p className="mt-2 text-right text-xs opacity-75"><time dateTime={row.created_at}>{timeFormat.format(date)}</time>{mine && row.read_at ? " · Read" : ""}</p>
              </article>
              {isCoach && !mine && <AskAI athleteId={athleteId} messageId={row.id} />}
              {cardsByMessage.get(row.id)?.map((suggestion) => (
                <InlineSuggestionCard key={suggestion.id} id={suggestion.id} suggestion={inlineSuggestion(suggestion)} />
              ))}
            </li>
          );
        })}
        {standaloneCards.map((suggestion) => (
          <li key={suggestion.id}>
            {suggestion.suggestion_type === "athlete_adjust_workout"
              ? <AthleteAdjustmentCard suggestion={suggestion} />
              : <InlineSuggestionCard id={suggestion.id} suggestion={inlineSuggestion(suggestion)} />}
          </li>
        ))}
      </ol>
      <MessageComposer key={athleteId} athleteId={athleteId} options={options} initialLink={initialLink} />
    </div>
  );
}
