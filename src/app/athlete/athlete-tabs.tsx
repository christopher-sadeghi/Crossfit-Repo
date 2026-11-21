"use client";

import { CalendarDays, History, NotebookPen, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/athlete", label: "Today", Icon: CalendarDays },
  { href: "/athlete/history", label: "History", Icon: History },
  { href: "/athlete/prs", label: "PRs", Icon: Trophy },
  { href: "/athlete/journal", label: "Journal", Icon: NotebookPen },
];

export function AthleteTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Athlete pages"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
