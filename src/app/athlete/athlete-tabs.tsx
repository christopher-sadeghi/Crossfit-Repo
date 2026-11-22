"use client";

import { Apple, CalendarDays, History, MessageSquare, NotebookPen, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/athlete", label: "Today", Icon: CalendarDays },
  { href: "/athlete/history", label: "History", Icon: History },
  { href: "/athlete/prs", label: "PRs", Icon: Trophy },
  { href: "/athlete/nutrition", label: "Nutrition", Icon: Apple },
  { href: "/athlete/journal", label: "Journal", Icon: NotebookPen },
  { href: "/athlete/messages", label: "Messages", Icon: MessageSquare },
];

export function AthleteTabs({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Athlete pages"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-6">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium sm:text-xs ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {label}
              {href === "/athlete/messages" && unreadMessages > 0 && <span aria-label={`${unreadMessages} unread messages`} className="absolute top-0.5 right-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
