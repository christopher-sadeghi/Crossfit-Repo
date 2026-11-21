import { demoEmbedUrl, guideSections, videoUrlSchema, type GuideText } from "@/lib/movement-guides";

export function HowTo({ name, videoUrl, guide }: { name: string; videoUrl: string | null; guide: GuideText | null }) {
  const safeUrl = videoUrl && videoUrlSchema.safeParse(videoUrl).success ? videoUrl : null;
  const embed = safeUrl ? demoEmbedUrl(safeUrl) : null;
  return (
    <section aria-label={`How to ${name}`} className="grid gap-6">
      {embed ? (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <iframe className="h-full w-full" src={embed} title={`${name} demo video`} loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : safeUrl ? (
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Watch the demo</a>
      ) : <p className="text-sm text-muted-foreground">No demo video yet</p>}
      <div className="grid gap-6 sm:grid-cols-2">
        {guideSections.map(([key, label]) => (
          <section key={key}>
            <h2 className="mb-2 font-semibold">{label}</h2>
            {guide?.[key].length ? key === "cues" ? (
              <ol className="list-decimal space-y-2 pl-5">{guide[key].map((text, i) => <li key={i}>{text}</li>)}</ol>
            ) : (
              <ul className="list-disc space-y-2 pl-5">{guide[key].map((text, i) => <li key={i}>{text}</li>)}</ul>
            ) : <p className="text-sm text-muted-foreground">Your coach hasn&apos;t added this yet. Ask them for guidance.</p>}
          </section>
        ))}
      </div>
    </section>
  );
}
