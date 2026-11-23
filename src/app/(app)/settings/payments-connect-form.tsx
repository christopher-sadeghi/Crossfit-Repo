"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { startStripeConnect } from "./payments-actions";

export function ConnectStripeForm({ label }: { label: string }) {
  const [state, action, pending] = useActionState(startStripeConnect, undefined);
  return (
    <form action={action} className="grid justify-items-start gap-2">
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>{label}</Button>
    </form>
  );
}
