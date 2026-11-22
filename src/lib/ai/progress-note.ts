export function joinProgressNote(header: string, summary: string, goalLines: string[]) {
  return [header, summary, ...goalLines].join("\n");
}
