import "server-only";

const SITEMAP_URL = "https://www.crossfit.com/essentials-sitemap.xml";
const MODIFIERS = ["kipping", "strict", "dumbbell", "barbell", "kettlebell"] as const;

function tokens(value: string) {
  return value.toLowerCase().replaceAll("&", " and ").split(/[^a-z0-9]+/)
    .filter((token) => token && token !== "the")
    .map((token) => token.length > 3 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token);
}

function sameTokens(left: string[], right: string[]) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

export function matchCrossfitSlug(name: string, slugs: string[]): string | null {
  const nameTokens = tokens(name);
  if (!nameTokens.length) return null;

  const exact = slugs.filter((slug) => sameTokens(tokens(slug), nameTokens));
  exact.sort((left, right) => Number(right.startsWith("the-")) - Number(left.startsWith("the-")));
  if (exact[0]) return exact[0];

  for (const modifier of MODIFIERS) {
    const match = slugs.find((slug) => {
      if (!slug.startsWith("the-")) return false;
      const slugTokens = tokens(slug);
      if (slugTokens.length !== nameTokens.length + 1) return false;
      return slugTokens.some((token, index) =>
        token === modifier && sameTokens(slugTokens.filter((_, tokenIndex) => tokenIndex !== index), nameTokens),
      );
    });
    if (match) return match;
  }

  return null;
}

export function extractCrossfitVideoId(html: string): string | null {
  return html.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/i)?.[1] ?? null;
}

async function fetchCrossfitPage(url: string) {
  const response = await fetch(url, {
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(5000),
    redirect: "manual",
  });
  if (response.status !== 200) return null;
  return response.text();
}

export async function lookupCrossfitVideo(name: string): Promise<{ crossfitUrl: string; videoUrl: string } | null> {
  try {
    const sitemap = await fetchCrossfitPage(SITEMAP_URL);
    if (!sitemap) return null;

    const slugs = Array.from(
      sitemap.matchAll(/<loc>https:\/\/www\.crossfit\.com\/essentials\/([a-z0-9-]+)<\/loc>/g),
      (match) => match[1],
    );
    const slug = matchCrossfitSlug(name, slugs);
    if (!slug) return null;

    const crossfitUrl = `https://www.crossfit.com/essentials/${slug}`;
    const page = await fetchCrossfitPage(crossfitUrl);
    if (!page) return null;
    const videoId = extractCrossfitVideoId(page);
    if (!videoId) return null;

    return { crossfitUrl, videoUrl: `https://www.youtube.com/watch?v=${videoId}` };
  } catch {
    return null;
  }
}
