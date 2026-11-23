export function coachRecipientId({ coach_id, assigned_coach_id }: {
  coach_id: string;
  assigned_coach_id: string | null;
}): string {
  return assigned_coach_id ?? coach_id;
}
