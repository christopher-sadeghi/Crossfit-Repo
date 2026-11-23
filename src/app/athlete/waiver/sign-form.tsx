"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/form-state";

import { signWaiver } from "./actions";

export function WaiverSignForm({ waiverId }: { waiverId: string }) {
  const [state, action, pending] = useActionState(signWaiver, {} as FormState);
  const [name, setName] = useState(state.values?.signed_name ?? "");
  const [agreed, setAgreed] = useState(state.values?.agreement === "on");

  return <form action={action} className="grid gap-4">
    <input type="hidden" name="waiver_id" value={waiverId} />
    <label className="grid gap-2 text-sm font-medium">
      Type your full name
      <Input name="signed_name" required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
    </label>
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="agreement" required checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
      <span>I have read and agree to this waiver</span>
    </label>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending || !name.trim() || !agreed}>{pending ? "Signing…" : "Sign waiver"}</Button>
  </form>;
}
