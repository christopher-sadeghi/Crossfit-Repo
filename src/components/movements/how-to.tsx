import Link from "next/link";
import type { ReactNode } from "react";

import { demoEmbedUrl, guideSections, videoUrlSchema, type MovementDemo, type MovementOption } from "@/lib/movement-guides";

export function HowTo({ demo, renderVariation, emptyMessage = "Your coach hasn't added this yet. Ask them for guidance." }: {
  demo: MovementDemo; renderVariation: (movement: MovementOption) => ReactNode; emptyMessage?: string;
}) {
  const { name, videoUrl, clipUrl, crossfitUrl, videoIsDefault, guide, easier, harder } = demo;
  const safeUrl = videoUrl && videoUrlSchema.safeParse(videoUrl).success ? videoUrl : null;
  const embed = safeUrl ? demoEmbedUrl(safeUrl) : null;
  const safeCrossfitUrl = crossfitUrl?.startsWith("https://www.crossfit.com/") ? crossfitUrl : null;
  return (
    <section aria-label={`How to ${name}`} className="grid gap-6">
      {clipUrl ? (
        <video className="aspect-video w-full rounded-lg bg-muted" src={clipUrl} controls playsInline preload="metadata" aria-label={`${name} demo video`} />
      ) : embed ? (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <iframe className="h-full w-full" src={embed} title={`${name} demo video`} loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : safeUrl ? (
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Watch the demo</a>
      ) : <p className="text-sm text-muted-foreground">No demo video yet</p>}
      {safeCrossfitUrl && (
        <div className="grid gap-1">
          {videoIsDefault && !clipUrl && <p className="text-xs text-muted-foreground">Video: CrossFit</p>}
          <a href={safeCrossfitUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">
            See {name} on CrossFit.com
          </a>
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        {guideSections.map(([key, label]) => {
          const variation = key === "easier_versions" ? easier : key === "harder_versions" ? harder : null;
          return (
          <section key={key}>
            <h2 className="mb-2 font-semibold">{key === "common_mistakes" ? "Common faults" : label}</h2>
            {variation && <div className="mb-2">{renderVariation(variation)}</div>}
            {guide[key].length ? key === "cues" ? (
              <ol className="list-decimal space-y-2 pl-5">{guide[key].map((text, i) => <li key={i}>{text}</li>)}</ol>
            ) : (
              <ul className="list-disc space-y-2 pl-5">{guide[key].map((text, i) => <li key={i}>{text}</li>)}</ul>
            ) : !variation && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
          </section>
          );
        })}
      </div>
    </section>
  );
}

export function DemoVariationLink({ movement, basePath }: { movement: MovementOption; basePath: string }) {
  return <Link href={`${basePath}/${movement.id}`} className="underline underline-offset-4">{movement.name}</Link>;
}
