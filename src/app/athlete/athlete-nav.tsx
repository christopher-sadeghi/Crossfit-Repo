"use client";

import { usePathname } from "next/navigation";

import { NavLinks, type NavItem } from "@/components/layout/nav-links";

import { ATHLETE_TABS } from "./athlete-tabs";

const ATHLETE_NAV_ITEMS: NavItem[] = ATHLETE_TABS.map(({ href, label, Icon }) => ({
  href,
  label,
  icon: Icon,
}));

export function AthleteNav({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const pathname = usePathname();

  if (pathname === "/athlete/onboarding") return null;

  return (
    <NavLinks
      items={ATHLETE_NAV_ITEMS}
      badges={{ "/athlete/messages": unreadMessages }}
    />
  );
}
