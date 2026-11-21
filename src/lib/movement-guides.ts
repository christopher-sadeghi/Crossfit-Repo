import { z } from "zod";

export const guideSections = [
  ["cues", "Step-by-step cues"],
  ["common_mistakes", "Common mistakes"],
  ["easier_versions", "Easier versions"],
  ["harder_versions", "Harder versions"],
] as const;

export type GuideText = Record<(typeof guideSections)[number][0], string[]>;

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
