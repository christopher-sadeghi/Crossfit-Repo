import { roundToLoadable, PLATE_SETS } from "./plates";
import { fromKgPrecise, type Units } from "./units";

export function parsePercentages(text: string | null | undefined, sets?: number): number[] {
  if (!text) return [];
  const match = text.match(/(\d+(?:\.\d+)?(?:\s*[\/\-–]\s*\d+(?:\.\d+)?)*\s*)%/);
  if (!match) return [];
  const values = (match[1].match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (values.some((value) => value <= 0 || value > 200)) return [];
  const prescribedSets = text.match(/(\d+)\s*[x×]\s*\d+/i)?.[1];
  const count = Math.max(1, Math.min(100, Math.floor(sets ?? (prescribedSets ? Number(prescribedSets) : values.length)) || 1));
  if (/[-–]/.test(match[1]) && values.length === 2) {
    return Array.from({ length: count }, (_, i) => values[0] + (values[1] - values[0]) * (count === 1 ? 0 : i / (count - 1)));
  }
  return Array.from({ length: count }, (_, i) => values[Math.min(i, values.length - 1)]);
}

export function percentageLoad(oneRmKg: number, percentage: number, units: Units, bar: number) {
  if (!Number.isFinite(oneRmKg) || oneRmKg <= 0 || !Number.isFinite(percentage) || percentage <= 0 || percentage > 200) throw new Error("Invalid percentage load");
  const kg = oneRmKg * percentage / 100;
  return { kg, weight: roundToLoadable(fromKgPrecise(kg, units), bar, PLATE_SETS[units]) };
}
