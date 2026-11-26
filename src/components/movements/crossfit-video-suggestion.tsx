"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { applyCrossfitVideo, suggestCrossfitVideo } from "@/app/(app)/programs/movements/[id]/actions";
import { Button } from "@/components/ui/button";
import { demoEmbedUrl } from "@/lib/movement-guides";

type Suggestion = { crossfitUrl: string; videoUrl: string };
type Status = "idle" | "loading" | "found" | "none" | "saved" | "skipped" | "error";

export function CrossfitVideoSuggestion({ movementId, movementName, auto }: {
  movementId: string; movementName: string; auto: boolean;
}) {
  const [status, setStatus] = useState<Status>(auto ? "loading" : "idle");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const autoLookupStarted = useRef(false);

  const findVideo = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      const result = await suggestCrossfitVideo(movementId);
      if (result.error) {
        setError(result.error);
        setStatus("error");
      } else if (result.suggestion) {
        setSuggestion(result.suggestion);
        setStatus("found");
      } else {
        setSuggestion(null);
        setStatus("none");
      }
    } catch {
      setError("Couldn't look up a CrossFit video. Please try again.");
      setStatus("error");
    }
  }, [movementId]);

  useEffect(() => {
    if (auto && !autoLookupStarted.current) {
      autoLookupStarted.current = true;
      void findVideo();
    }
  }, [auto, findVideo]);

  async function useVideo() {
    setSaving(true);
    setError(undefined);
    try {
      const result = await applyCrossfitVideo(movementId);
      if (result.error) {
        setError(result.error);
      } else {
        setStatus("saved");
      }
    } catch {
      setError("Couldn't save this CrossFit video. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "idle") {
    return <Button type="button" variant="outline" onClick={findVideo}>Find a CrossFit video</Button>;
  }
  if (status === "skipped") return null;

  const movementHref = `/programs/movements/${movementId}`;
  const embedUrl = suggestion ? demoEmbedUrl(suggestion.videoUrl) : null;

  return (
    <section className="grid gap-3 rounded-lg border p-4">
      {status === "loading" && <p role="status" className="text-sm text-muted-foreground">Looking for a CrossFit video…</p>}
      {status === "error" && (
        <div className="grid gap-2">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={findVideo}>Try again</Button>
        </div>
      )}
      {status === "none" && (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">No CrossFit video found. You can paste a YouTube or Vimeo link on the movement&apos;s page.</p>
          <Link href={movementHref} className="text-sm underline underline-offset-4">Open movement page</Link>
        </div>
      )}
      {status === "found" && suggestion && (
        <div className="grid gap-3">
          {embedUrl && (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
              <iframe
                className="h-full w-full"
                src={embedUrl}
                title={`${movementName} CrossFit demo video`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          <a href={suggestion.crossfitUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">
            Found on CrossFit.com
          </a>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={saving} onClick={useVideo}>{saving ? "Adding…" : "Use this video"}</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setStatus("skipped")}>Skip</Button>
          </div>
        </div>
      )}
      {status === "saved" && (
        <div className="grid gap-2">
          <p role="status" className="text-sm text-muted-foreground">Video added.</p>
          <Link href={movementHref} className="text-sm underline underline-offset-4">Open movement page</Link>
        </div>
      )}
    </section>
  );
}
