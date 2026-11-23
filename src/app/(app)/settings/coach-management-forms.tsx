"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCoachInvite, removeGymCoach, revokeCoachInvite, type CoachInviteState } from "./coach-actions";

export function InviteCoachForm() {
  const [state, action, pending] = useActionState(createCoachInvite, {});
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <Input name="email" type="email" required maxLength={254} placeholder="coach@example.com" aria-label="Coach email" />
      <Button disabled={pending}>{pending ? "Sending…" : "Invite coach"}</Button>
      {state.error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{state.message}</p>}
      {state.link && <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <code className="max-w-full break-all rounded bg-muted px-2 py-1 text-xs">{state.link}</code>
        <Button type="button" variant="outline" size="sm" onClick={async () => {
          await navigator.clipboard.writeText(state.link!);
          setCopied(true);
        }}>{copied ? "Copied" : "Copy link"}</Button>
      </div>}
    </form>
  );
}

export function CopyCoachInviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return <Button type="button" variant="outline" size="sm" onClick={async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }}>{copied ? "Copied" : "Copy link"}</Button>;
}

export function RevokeCoachInviteButton({ id }: { id: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="grid justify-items-start gap-1">
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => {
      if (!confirm("Revoke this coach invitation?")) return;
      startTransition(async () => {
        const result = await revokeCoachInvite(id);
        setError(result.error ?? "");
      });
    }}>{pending ? "Revoking…" : "Revoke"}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export function RemoveGymCoachButton({ id, name }: { id: string; name: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="grid justify-items-start gap-1">
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => {
      if (!confirm(`Remove ${name} from this gym? Their athletes will be unassigned, and they will become the owner of a new gym.`)) return;
      startTransition(async () => {
        const result = await removeGymCoach(id);
        setError(result.error ?? "");
      });
    }}>{pending ? "Removing…" : "Remove"}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export type { CoachInviteState };
