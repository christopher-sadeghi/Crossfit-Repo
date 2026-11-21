import Link from "next/link";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/programs", label: "Programs" },
  { href: "/programs/workouts", label: "WODs" },
  { href: "/programs/movements", label: "Movements" },
];

export function ProgramsNav({ active }: { active: string }) {
  return (
    <nav className="mb-6 flex gap-1 border-b" aria-label="Programs sections">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active === l.href ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            active === l.href
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
