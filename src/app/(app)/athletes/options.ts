export const LEVELS = ["beginner", "intermediate", "advanced", "competitor"] as const;
export const SEXES = ["female", "male", "other"] as const;

export const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  competitor: "Competitor",
};
