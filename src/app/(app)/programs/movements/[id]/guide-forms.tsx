"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import { guideSections, type GuideText } from "@/lib/movement-guides";

import { decideMovementGuide, requestMovementGuide, saveMovementGuide } from "./actions";

function Message({ state }: { state: FormState }) {
  return state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p>
    : state.message ? <p role="status" className="text-sm">{state.message}</p> : null;
}

export function RequestGuideForm({ movementId }: { movementId: string }) {
  const [state, action, pending] = useActionState(requestMovementGuide, {});
  return (
    <form className="grid justify-items-start gap-3" onSubmit={(event) => {
      event.preventDefault();
      startTransition(() => action(new FormData(event.currentTarget)));
    }}>
      <input type="hidden" name="movement_id" value={movementId} />
      <p className="text-sm text-muted-foreground">AI writes a draft only. Nothing is published until you approve.</p>
      <Button disabled={pending}>{pending ? "Writing… this may take a minute" : "Ask AI to write the how-to"}</Button>
      <Message state={state} />
    </form>
  );
}

export function GuideForm({ movementId, values, videoUrl, suggestionId }: {
  movementId: string; values: GuideText | null; videoUrl?: string | null; suggestionId?: string;
}) {
  const [state, action, pending] = useActionState(suggestionId ? decideMovementGuide : saveMovementGuide, {});
  const prefix = suggestionId ?? movementId;
  const submitted = state.error ? state.values : undefined;
  return (
    <form className="grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      data.set("decision", submitter?.value ?? "approve");
      startTransition(() => action(data));
    }}>
      <input type="hidden" name="movement_id" value={movementId} />
      {suggestionId ? <input type="hidden" name="suggestion_id" value={suggestionId} /> : (
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefix}-video`}>Video URL</Label>
          <Input id={`${prefix}-video`} name="video_url" type="url" maxLength={2048} defaultValue={submitted?.video_url ?? videoUrl ?? ""} placeholder="https://…" />
          <p className="text-sm text-muted-foreground">Leave blank to use the library demo. YouTube and Vimeo embed; other https links open separately.</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">One item per line, up to 200 characters each.{suggestionId && " Review and edit this draft before approving."}</p>
      {guideSections.map(([key, label]) => (
        <div key={key} className="grid gap-1.5">
          <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
          <Textarea id={`${prefix}-${key}`} name={key} rows={4} defaultValue={submitted?.[key] ?? values?.[key].join("\n") ?? ""} />
        </div>
      ))}
      <Message state={state} />
      <div className="flex gap-3">
        <Button type="submit" value="approve" disabled={pending}>{pending ? "Saving…" : suggestionId ? "Approve" : "Save how-to"}</Button>
        {suggestionId && <Button type="submit" value="reject" variant="outline" disabled={pending} formNoValidate>Reject</Button>}
      </div>
    </form>
  );
}
