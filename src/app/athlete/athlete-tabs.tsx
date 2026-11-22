"use client";

import { Apple, CalendarDays, History, NotebookPen, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/athlete", label: "Today", Icon: CalendarDays },
  { href: "/athlete/history", label: "History", Icon: History },
  { href: "/athlete/prs", label: "Benchmarks", Icon: Trophy },
  { href: "/athlete/nutrition", label: "Nutrition", Icon: Apple },
  { href: "/athlete/journal", label: "Journal", Icon: NotebookPen },
];

export function AthleteTabs() {
  const pathname = usePathname();
  if (pathname === "/athlete/onboarding") return null;

  return (
    <nav
      aria-label="Athlete pages"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
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
