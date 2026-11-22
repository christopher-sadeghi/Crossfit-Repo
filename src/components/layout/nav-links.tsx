"use client";

import {
  CalendarDays,
  ClipboardCheck,
  Trophy,
  LayoutDashboard,
  MessageSquare,
  Salad,
  Settings,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/athletes", label: "Athletes", icon: Users },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/programs", label: "Programs", icon: CalendarDays },
  { href: "/benchmarks", label: "Benchmarks", icon: Trophy },
  { href: "/nutrition", label: "Nutrition", icon: Salad },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavLinks({
  items = NAV_ITEMS,
  badges = {},
}: {
  items?: NavItem[];
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1">
      {items.map(({ href, label, icon: Icon }, index) => {
        const active =
          index === 0
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
            {badges[href] ? (
              <span
                className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white"
                aria-label={`${badges[href]} unread ${label.toLowerCase()} items`}
              >
                {badges[href]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
