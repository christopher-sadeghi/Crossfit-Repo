import { z } from "zod";

export function movementIdSchema(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0 || uniqueIds.length > 500) return z.string();
  return z.enum(uniqueIds as [string, ...string[]]);
}
