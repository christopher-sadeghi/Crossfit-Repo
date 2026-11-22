"use client";

import { Apple, CalendarDays, Camera, ClipboardList, History, MessageSquare, NotebookPen, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/athlete", label: "Today", Icon: CalendarDays },
  { href: "/athlete/history", label: "History", Icon: History },
  { href: "/athlete/prs", label: "Benchmarks", Icon: Trophy },
  { href: "/athlete/nutrition", label: "Nutrition", Icon: Apple },
  { href: "/athlete/journal", label: "Journal", Icon: NotebookPen },
  { href: "/athlete/reports", label: "Reports", Icon: ClipboardList },
  { href: "/athlete/progress", label: "Progress", Icon: Camera },
  { href: "/athlete/messages", label: "Messages", Icon: MessageSquare },
];

export function AthleteTabs({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Athlete pages"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-8">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-label={href === "/athlete/prs" ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 text-[9px] font-medium min-[400px]:text-[10px] ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {href === "/athlete/prs" ? (
                <>
                  <span className="min-[400px]:hidden">PRs</span>
                  <span className="hidden min-[400px]:inline">{label}</span>
                </>
              ) : label}
              {href === "/athlete/messages" && unreadMessages > 0 && <span aria-label={`${unreadMessages} unread messages`} className="absolute top-0.5 right-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
