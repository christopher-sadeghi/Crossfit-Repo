"use client";

import { startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import { DEMO_CLIP_FORMATS, guideSections, MAX_DEMO_CLIP_BYTES, MOVEMENT_DEMO_BUCKET, type GuideText, type MovementOption } from "@/lib/movement-guides";
import { createClient } from "@/lib/supabase/client";

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

type Editor = {
  coachId: string; videoUrl: string | null; hasClip: boolean; hasDefaultVideo: boolean; library: MovementOption[];
  easierId: string | null; harderId: string | null; libraryEasier?: string; libraryHarder?: string;
};

export function GuideForm({ movementId, values, editor, suggestionId }: {
  movementId: string; values: GuideText | null; editor?: Editor; suggestionId?: string;
}) {
  const [uploadError, setUploadError] = useState<string>();
  const [state, action, pending] = useActionState(async (previous: FormState, data: FormData): Promise<FormState> => {
    if (!editor) return decideMovementGuide(previous, data);
    const file = data.get("clip");
    data.delete("clip");
    if (!(file instanceof File) || !file.size) return saveMovementGuide(previous, data);
    const format = DEMO_CLIP_FORMATS[file.type];
    if (!format || file.size > MAX_DEMO_CLIP_BYTES) return { error: "Choose an MP4 or WebM up to 20 MB." };
    if (String(data.get("video_url") ?? "").trim()) return { error: "Clear the video link to upload a clip." };
    const path = `${editor.coachId}/${movementId}/${crypto.randomUUID()}.${format}`;
    const storage = createClient().storage.from(MOVEMENT_DEMO_BUCKET);
    const { error } = await storage.upload(path, file);
    if (error) return { error: "Couldn't upload the clip. Please try again." };
    data.set("uploaded_clip", path);
    try {
      const result = await saveMovementGuide(previous, data);
      if (result.error) await storage.remove([path]);
      return result;
    } catch {
      await storage.remove([path]);
      return { error: "Couldn't save the clip. Please try again." };
    }
  }, {});
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
      {suggestionId && <input type="hidden" name="suggestion_id" value={suggestionId} />}
      {editor && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefix}-video`}>YouTube or Vimeo link</Label>
            <Input id={`${prefix}-video`} name="video_url" type="url" maxLength={2048} defaultValue={submitted?.video_url ?? editor.videoUrl ?? ""} placeholder="https://…" />
            {editor.hasDefaultVideo && <p className="text-sm text-muted-foreground">Leave blank to use CrossFit&apos;s video.</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefix}-clip`}>{editor.hasClip ? "Replace uploaded clip" : "Or upload a clip"}</Label>
            <Input id={`${prefix}-clip`} name="clip" type="file" accept="video/mp4,video/webm" aria-describedby={`${prefix}-clip-help`}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                setUploadError(file && (!DEMO_CLIP_FORMATS[file.type] || file.size > MAX_DEMO_CLIP_BYTES) ? "Choose an MP4 or WebM up to 20 MB." : undefined);
              }} />
            <p id={`${prefix}-clip-help`} className="text-sm text-muted-foreground">MP4 or WebM, up to 20 MB. Only you and your athletes can watch it.</p>
            {editor.hasClip && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove_clip" /> Remove current clip</label>}
            {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
          </div>
        </>
      )}
      <p className="text-sm text-muted-foreground">One item per line, up to 200 characters each.{suggestionId ? " Review and edit this draft before approving." : " Enter 3–5 coaching cues."}</p>
      {guideSections.filter(([key]) => !editor || key === "cues" || key === "common_mistakes" || values?.[key].length).map(([key, label]) => (
        <div key={key} className="grid gap-1.5">
          <Label htmlFor={`${prefix}-${key}`}>{key === "common_mistakes" ? "Common faults" : label}</Label>
          <Textarea id={`${prefix}-${key}`} name={key} rows={4} defaultValue={submitted?.[key] ?? values?.[key].join("\n") ?? ""} />
        </div>
      ))}
      {editor && ([
        ["easier_movement_id", "Easier movement", editor.easierId, editor.libraryEasier],
        ["harder_movement_id", "Harder movement", editor.harderId, editor.libraryHarder],
      ] as const).map(([key, label, value, defaultName]) => (
        <div key={key} className="grid gap-1.5">
          <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
          <select id={`${prefix}-${key}`} name={key} defaultValue={submitted?.[key] ?? value ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">{defaultName ? `Library default: ${defaultName}` : "Choose a movement"}</option>
            {editor.library.map((movement) => <option key={movement.id} value={movement.id}>{movement.name}</option>)}
          </select>
        </div>
      ))}
      <Message state={state} />
      <div className="flex gap-3">
        <Button type="submit" value="approve" disabled={pending || !!uploadError}>{pending ? "Saving…" : suggestionId ? "Approve" : "Save demo"}</Button>
        {suggestionId && <Button type="submit" value="reject" variant="outline" disabled={pending} formNoValidate>Reject</Button>}
      </div>
    </form>
  );
}
