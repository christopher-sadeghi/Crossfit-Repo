"use client";

import { Apple, CalendarDays, Camera, ClipboardList, Ellipsis, History, MessageSquare, NotebookPen, Trophy, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type AthleteTab = {
  href: string;
  label: string;
  group: "primary" | "more";
  Icon: typeof Video;
};

export const ATHLETE_TABS: AthleteTab[] = [
  { href: "/athlete", label: "Today", group: "primary", Icon: CalendarDays },
  { href: "/athlete/history", label: "History", group: "more", Icon: History },
  { href: "/athlete/prs", label: "Benchmarks", group: "more", Icon: Trophy },
  { href: "/athlete/nutrition", label: "Nutrition", group: "primary", Icon: Apple },
  { href: "/athlete/journal", label: "Journal", group: "more", Icon: NotebookPen },
  { href: "/athlete/reports", label: "Reports", group: "more", Icon: ClipboardList },
  { href: "/athlete/progress", label: "Progress", group: "more", Icon: Camera },
  { href: "/athlete/form-checks", label: "Form checks", group: "more", Icon: Video },
  { href: "/athlete/messages", label: "Messages", group: "primary", Icon: MessageSquare },
];

export const ATHLETE_PRIMARY_TABS = ATHLETE_TABS.filter(({ group }) => group === "primary");
export const ATHLETE_MORE_TABS = ATHLETE_TABS.filter(({ group }) => group === "more");

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/athlete" && pathname.startsWith(`${href}/`));
}

export function AthleteTabs({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const pathname = usePathname();
  if (pathname === "/athlete/onboarding") return null;
  const moreIsActive = ATHLETE_MORE_TABS.some(({ href }) => isActivePath(pathname, href));

  return (
    <nav
      aria-label="Athlete pages"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {ATHLETE_PRIMARY_TABS.map(({ href, label, Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 text-xs font-medium ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {label}
              {href === "/athlete/messages" && unreadMessages > 0 && <span aria-label={`${unreadMessages} unread messages`} className="absolute top-0.5 right-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-current={moreIsActive ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 text-xs font-medium ${
                moreIsActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Ellipsis className="size-5" />
              More
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border-x p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <SheetHeader className="px-0 pt-0">
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <div className="grid gap-1">
              {ATHLETE_MORE_TABS.map(({ href, label, Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <SheetClose asChild key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-5" />
                      {label}
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
