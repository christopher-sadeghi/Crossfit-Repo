import { assistantCardSchema, type AssistantCard } from "./assistant-schema";

export function assistantCards(metadata: unknown): AssistantCard[] {
  if (!metadata || typeof metadata !== "object" || !("cards" in metadata) || !Array.isArray(metadata.cards)) return [];
  return metadata.cards.flatMap((card) => {
    const parsed = assistantCardSchema.safeParse(card);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, 6);
}

export function safeAssistantHref(href: string): string | null {
  try {
    const decoded = decodeURIComponent(href);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\s\u0000-\u001f]/.test(decoded)) return null;
    return href;
  } catch { return null; }
}

export function assistantTextParts(text: string) {
  const parts: { text: string; href?: string }[] = [];
  const links = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let offset = 0;
  for (const match of text.matchAll(links)) {
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
    const href = safeAssistantHref(match[2]);
    parts.push(href ? { text: match[1], href } : { text: match[0] });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}
