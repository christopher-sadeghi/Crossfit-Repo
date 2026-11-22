"use client";

import { ArrowLeft, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";

import { getAthleteMovementDemo } from "@/app/athlete/movements/actions";
import type { MovementDemo, MovementOption } from "@/lib/movement-guides";
import { cn } from "@/lib/utils";

import { HowTo } from "./how-to";

function DemoBody({ id, onVariation }: { id: string; onVariation: (movement: MovementOption) => void }) {
  const [demo, setDemo] = useState<MovementDemo | null>();
  useEffect(() => {
    let active = true;
    getAthleteMovementDemo(id).then((result) => {
      if (active) setDemo(result);
    }, () => {
      if (active) setDemo(null);
    });
    return () => { active = false; };
  }, [id]);

  if (demo === undefined) return <p role="status" className="text-sm text-muted-foreground">Loading demo…</p>;
  if (!demo) return <p role="status" className="text-sm text-muted-foreground">This demo is not available right now.</p>;
  return <HowTo demo={demo} renderVariation={(movement) => (
    <button type="button" className="cursor-pointer text-left underline underline-offset-4" onClick={() => onVariation(movement)}>
      {movement.name}
    </button>
  )} />;
}

export function MovementDemoSheet({ movement, children, className }: {
  movement: MovementOption; children: ReactNode; className?: string;
}) {
  const [trail, setTrail] = useState<MovementOption[]>([]);
  const current = trail.at(-1);
  return (
    <Dialog.Root open={!!current} onOpenChange={(open) => setTrail(open ? [movement] : [])}>
      <Dialog.Trigger className={cn("cursor-pointer text-left underline underline-offset-4", className)} type="button">
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto grid max-h-[90dvh] w-full max-w-2xl gap-5 overflow-y-auto rounded-t-xl border bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              {trail.length > 1 && (
                <button type="button" onClick={() => setTrail((items) => items.slice(0, -1))} className="mb-2 flex cursor-pointer items-center gap-1 text-sm underline">
                  <ArrowLeft className="size-4" /> Back
                </button>
              )}
              <Dialog.Title className="text-xl font-semibold">How to {current?.name ?? movement.name}</Dialog.Title>
              <Dialog.Description className="sr-only">Movement demo, coaching cues, common faults and scaling options</Dialog.Description>
            </div>
            <Dialog.Close className="shrink-0 cursor-pointer rounded-md p-2 hover:bg-muted" aria-label="Close movement demo">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {current && <DemoBody key={current.id} id={current.id} onVariation={(option) => setTrail((items) => [...items, option])} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
