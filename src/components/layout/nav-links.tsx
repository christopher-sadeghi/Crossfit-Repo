"use client";

import {
  CalendarDays,
  Trophy,
  LayoutDashboard,
  Salad,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/athletes", label: "Athletes", icon: Users },
  { href: "/programs", label: "Programs", icon: CalendarDays },
  { href: "/benchmarks", label: "Benchmarks", icon: Trophy },
  { href: "/nutrition", label: "Nutrition", icon: Salad },
  { href: "/suggestions", label: "AI Suggestions", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavLinks({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
                aria-label={`${badges[href]} athlete change${badges[href] === 1 ? "" : "s"} to review`}
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
