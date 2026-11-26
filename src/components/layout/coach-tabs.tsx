"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/components/layout/nav-links";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const PRIMARY_HREFS = new Set(["/", "/athletes", "/programs", "/messages"]);

export const COACH_PRIMARY_TABS = NAV_ITEMS.filter(({ href }) =>
  PRIMARY_HREFS.has(href),
);
export const COACH_MORE_TABS = NAV_ITEMS.filter(
  ({ href }) => !PRIMARY_HREFS.has(href),
);

function isActivePath(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function formatBadge(count: number) {
  return count > 99 ? "99+" : count;
}

export function CoachTabs({
  badges = {},
}: {
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const moreIsActive = COACH_MORE_TABS.some(({ href }) =>
    isActivePath(pathname, href),
  );
  const formChecks = badges["/form-checks"] ?? 0;

  return (
    <nav
      aria-label="Coach pages"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {COACH_PRIMARY_TABS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          const badge = badges[href] ?? 0;
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
              {badge > 0 && (
                <span
                  aria-label={`${badge} unread ${label.toLowerCase()} items`}
                  className="absolute top-0.5 right-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground"
                >
                  {formatBadge(badge)}
                </span>
              )}
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-current={moreIsActive ? "page" : undefined}
              className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 text-xs font-medium ${
                moreIsActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Ellipsis className="size-5" />
              More
              {formChecks > 0 && (
                <span
                  aria-label={`${formChecks} form checks`}
                  className="absolute top-0.5 right-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white"
                >
                  {formatBadge(formChecks)}
                </span>
              )}
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
              {COACH_MORE_TABS.map(({ href, label, icon: Icon }) => {
                const active = isActivePath(pathname, href);
                const badge = badges[href] ?? 0;
                return (
                  <SheetClose asChild key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                        active
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-5" />
                      {label}
                      {badge > 0 && (
                        <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                          {formatBadge(badge)}
                        </span>
                      )}
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
