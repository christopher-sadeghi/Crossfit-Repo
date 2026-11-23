"use client";

import { useActionState, useState, useTransition } from "react";
import { Archive } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { archiveMembershipPlan, createMembershipPlan } from "./payments-actions";

type Plan = {
  id: string;
  name: string;
  amount_cents: number;
  interval: "month" | "year";
};

export function PaymentsPlans({ plans }: { plans: Plan[] }) {
  const [state, formAction, pending] = useActionState(createMembershipPlan, undefined);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h3 className="font-medium">Membership plans</h3>
        {plans.length ? (
          <ul className="grid gap-2">
            {plans.map((plan) => (
              <li key={plan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-sm text-muted-foreground">
                    ${(plan.amount_cents / 100).toFixed(2)} / {plan.interval === "month" ? "month" : "year"}
                  </p>
                </div>
                <ArchivePlanButton id={plan.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">You haven&apos;t added a membership plan yet.</p>
        )}
      </div>
      <form action={formAction} className="grid gap-3 rounded-md border p-4">
        <h3 className="font-medium">Add a plan</h3>
        <label className="grid gap-1 text-sm">
          Plan name
          <Input name="name" required maxLength={80} />
        </label>
        <label className="grid gap-1 text-sm">
          Price in dollars
          <Input name="amount" type="number" inputMode="decimal" min="0.50" max="100000" step="0.01" required />
        </label>
        <label className="grid gap-1 text-sm">
          Billing interval
          <select name="interval" defaultValue="month" className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">Plans can&apos;t be edited. Archive a plan and add a new one to change it.</p>
        {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {state?.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
        <Button type="submit" disabled={pending}>Add plan</Button>
      </form>
    </div>
  );
}

function ArchivePlanButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div className="flex items-center gap-2">
      {message && <span role="status" className="text-xs text-muted-foreground">{message}</span>}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => {
        startTransition(async () => {
          const result = await archiveMembershipPlan(id);
          setMessage(result.error ?? result.message ?? "");
        });
      }}>
        <Archive />
        Archive
      </Button>
    </div>
  );
}
