import type { Units } from "./units";

export const PLATE_SETS = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
export const BAR_OPTIONS = { kg: [20, 15], lb: [45, 35] };

function sortedPlates(plateSet: number[]) {
  if (!plateSet.length || plateSet.some((p) => !Number.isFinite(p) || p <= 0)) throw new Error("Invalid plate set");
  return [...new Set(plateSet)].sort((a, b) => b - a);
}

export function platesPerSide(totalWeight: number, bar: number, plateSet: number[]) {
  const available = sortedPlates(plateSet);
  if (!Number.isFinite(totalWeight) || !Number.isFinite(bar) || bar <= 0 || totalWeight < 0) throw new Error("Invalid weight");
  let remaining = Math.max(0, (totalWeight - bar) / 2);
  const plates: number[] = [];
  for (const plate of available) {
    const count = Math.floor((remaining + 1e-8) / plate);
    for (let i = 0; i < count; i++) plates.push(plate);
    remaining -= count * plate;
  }
  return { plates, remainder: totalWeight < bar ? totalWeight - bar : Math.round(remaining * 2 * 1e6) / 1e6 };
}

export function roundToLoadable(weight: number, bar: number, plateSet: number[]) {
  const smallest = sortedPlates(plateSet).at(-1)!;
  if (!Number.isFinite(weight) || !Number.isFinite(bar) || bar <= 0) throw new Error("Invalid weight");
  const increment = 2 * smallest;
  return Math.round((bar + Math.max(0, Math.round((weight - bar) / increment)) * increment) * 1e6) / 1e6;
}

export function defaultBar(units: Units) { return BAR_OPTIONS[units][0]; }
