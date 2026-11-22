"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { getNotifications, markAllNotificationsRead, markNotificationRead, type NotificationFeed, type NotificationItem } from "@/app/notification-actions";
import { Button } from "@/components/ui/button";

export function NotificationBell({ initial, timeZone, align = "end" }: { initial: NotificationFeed; timeZone: string; align?: "start" | "end" }) {
  const [feed, setFeed] = useState(initial);
  const [error, setError] = useState(initial.error ?? "");
  const [pending, startTransition] = useTransition();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const generation = useRef(0);
  const unreadMessages = useRef(initial.unreadMessages);
  const router = useRouter();
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" });

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || loading) return;
      loading = true;
      const current = generation.current;
      try {
        const next = await getNotifications();
        if (!cancelled && current === generation.current) {
          if (!next.error) {
            setFeed(next);
            if (next.unreadMessages !== unreadMessages.current) {
              unreadMessages.current = next.unreadMessages;
              router.refresh();
            }
          }
          setError(next.error ?? "");
        }
      } catch {
        if (!cancelled) setError("Couldn't refresh notifications. Check your connection.");
      } finally {
        loading = false;
      }
    };
    const timer = window.setInterval(refresh, 18_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);

  useEffect(() => { unreadMessages.current = initial.unreadMessages; }, [initial.unreadMessages]);

  const markRead = (item?: NotificationItem) => startTransition(async () => {
    try {
      const result = item ? await markNotificationRead(item.id) : await markAllNotificationsRead();
      if (result.error) { setError(result.error); return; }
      generation.current++;
      setError("");
      setFeed((previous) => ({
        ...previous,
        count: item ? Math.max(0, previous.count - (previous.items.find((row) => row.id === item.id)?.read_at === null ? 1 : 0)) : 0,
        items: previous.items.map((row) => !item || row.id === item.id ? { ...row, read_at: row.read_at ?? new Date().toISOString() } : row),
      }));
      if (item?.link && item.link.startsWith("/") && !item.link.startsWith("//") && !item.link.includes("\\")) {
        if (disclosure.current) disclosure.current.open = false;
        router.push(item.link);
      }
    } catch {
      setError("Couldn't mark notifications read. Check your connection.");
    }
  });

  return (
    <details ref={disclosure} className="relative" onKeyDown={(event) => {
      if (event.key === "Escape" && disclosure.current) {
        disclosure.current.open = false;
        disclosure.current.querySelector("summary")?.focus();
      }
    }}>
      <summary aria-label={`Notifications, ${feed.count} unread`} className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <Bell className="size-4" aria-hidden="true" />
        <span className="sr-only">Notifications</span>
        {feed.count > 0 && <span aria-hidden="true" className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{feed.count > 99 ? "99+" : feed.count}</span>}
      </summary>
      <section aria-label="Notifications" className={`fixed inset-x-4 top-20 z-40 mt-2 rounded-lg border bg-background p-3 shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:w-88 ${align === "start" ? "sm:left-0" : "sm:right-0"}`}>
        <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-semibold">Notifications</h2><Button size="sm" variant="ghost" disabled={pending || feed.count === 0} onClick={() => markRead()}>Mark all read</Button></div>
        {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
        {feed.items.length ? <ul className="max-h-96 space-y-1 overflow-y-auto">
          {feed.items.map((item) => {
            const content = <><span className="block font-medium">{!item.read_at && <span className="mr-1 text-primary" aria-label="Unread">●</span>}{item.title}</span>{item.body && <span className="mt-1 block whitespace-pre-line break-words text-muted-foreground">{item.body}</span>}<time dateTime={item.created_at} className="mt-1 block text-xs text-muted-foreground">{formatter.format(new Date(item.created_at))}</time></>;
            const className = `block w-full rounded-md p-3 text-left text-sm [overflow-wrap:anywhere] hover:bg-muted ${item.read_at ? "" : "bg-muted/60"}`;
            return <li key={item.id}>{item.link ? <Link href={item.link.startsWith("/") && !item.link.startsWith("//") && !item.link.includes("\\") ? item.link : "#"} aria-disabled={pending} onClick={(event) => { event.preventDefault(); if (!pending) markRead(item); }} className={className}>{content}</Link> : <button type="button" disabled={pending} onClick={() => markRead(item)} className={className}>{content}</button>}</li>;
          })}
        </ul> : <p className="py-5 text-center text-sm text-muted-foreground">No notifications yet.</p>}
      </section>
    </details>
  );
}
