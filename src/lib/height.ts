export function cmToFtIn(cm: number | null | undefined): { ft: number; in: number } | null {
  if (cm == null || !Number.isFinite(cm)) return null;

  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inches = Math.round((totalIn - ft * 12) * 2) / 2;
  if (inches === 12) {
    ft += 1;
    inches = 0;
  }

  return { ft, in: inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * 2.54 * 10) / 10;
}
