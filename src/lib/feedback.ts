export const FEEDBACK_LABELS = {
  energy: ["Drained", "Low", "Okay", "Good", "Great"],
  soreness: ["None", "Mild", "Moderate", "Sore", "Very sore"],
} as const;

export type AttentionResult = {
  performed_on: string;
  rpe: number | null;
  pain_notes: string | null;
};

export function needsAttention(results: AttentionResult[], todayIso: string) {
  const firstDay = new Date(`${todayIso}T00:00:00Z`);
  firstDay.setUTCDate(firstDay.getUTCDate() - 6);
  const firstDayIso = firstDay.toISOString().slice(0, 10);
  const reasons: { date: string; kind: "pain" | "effort"; text: string }[] = [];

  for (const result of results) {
    const date = result.performed_on.slice(0, 10);
    if (date < firstDayIso || date > todayIso) continue;

    const pain = result.pain_notes?.trim();
    if (pain) reasons.push({ date, kind: "pain", text: pain });
    if (result.rpe != null && result.rpe >= 9) {
      reasons.push({ date, kind: "effort", text: `RPE ${result.rpe}` });
    }
  }

  return { flagged: reasons.length > 0, reasons };
}

export function feedbackSummary(result: {
  rpe: number | null;
  energy: number | null;
  sleep_hours: number | null;
  soreness: number | null;
}) {
  return [
    result.rpe != null && `RPE ${result.rpe}/10`,
    result.energy != null && `Energy ${result.energy}/5`,
    result.sleep_hours != null && `Sleep ${result.sleep_hours}h`,
    result.soreness != null && `Soreness ${result.soreness}/5`,
  ]
    .filter(Boolean)
    .join(" · ");
}
