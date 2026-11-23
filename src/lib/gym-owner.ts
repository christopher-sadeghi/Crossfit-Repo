export function gymOwnerRow<T extends { id: string; gym_id: string }>(rows: readonly T[]): T | null {
  return rows.find((row) => row.id === row.gym_id) ?? null;
}
