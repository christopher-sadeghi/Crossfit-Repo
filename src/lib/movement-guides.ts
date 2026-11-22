import { z } from "zod";

export const guideSections = [
  ["cues", "Step-by-step cues"],
  ["common_mistakes", "Common mistakes"],
  ["easier_versions", "Easier versions"],
  ["harder_versions", "Harder versions"],
] as const;

export type GuideText = Record<(typeof guideSections)[number][0], string[]>;

export const MIN_DEMO_CUES = 3;
export const MAX_DEMO_CUES = 5;

export function canSaveDemoCues(cues: string[], published: string[] = []) {
  return (cues.length >= MIN_DEMO_CUES && cues.length <= MAX_DEMO_CUES) ||
    (cues.length > MAX_DEMO_CUES && cues.length === published.length &&
     cues.every((cue, i) => cue === published[i].trim()));
}

export const MOVEMENT_DEMO_BUCKET = "movement-demos";
export const MAX_DEMO_CLIP_BYTES = 20 * 1024 * 1024;
export const DEMO_CLIP_FORMATS: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };

export type MovementOption = { id: string; name: string };
export type MovementDemo = {
  name: string;
  videoUrl: string | null;
  clipUrl: string | null;
  guide: GuideText;
  easier: MovementOption | null;
  harder: MovementOption | null;
};

export const videoUrlSchema = z.string().trim().max(2048).url().refine(
  (value) => value.startsWith("https://") && !/\s/.test(value),
  "Use an https video URL.",
);

const editedItems = z.array(z.string().trim().min(1).max(200)).max(20);
export const editedGuideSchema = z.object({
  cues: editedItems,
  common_mistakes: editedItems,
  easier_versions: editedItems,
  harder_versions: editedItems,
});

export function readGuideText(form: FormData): GuideText {
  return Object.fromEntries(guideSections.map(([key]) => [key,
    String(form.get(key) ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
  ])) as GuideText;
}

export function hasGuideText(guide: GuideText | null) {
  return !!guide && guideSections.some(([key]) => guide[key].length > 0);
}

export function demoEmbedUrl(value: string): string | null {
  if (!videoUrlSchema.safeParse(value).success) return null;
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)\/?$/)?.[1] ?? null;
  } else if (["youtu.be", "www.youtu.be"].includes(host)) id = url.pathname.slice(1);
  if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    const match = url.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([a-z\d]+))?\/?$/i);
    if (match) {
      const hash = url.searchParams.get("h") ?? match[2];
      return `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${encodeURIComponent(hash)}` : ""}`;
    }
  }
  return null;
}
