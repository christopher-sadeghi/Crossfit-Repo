import { z } from "zod";

import { addDays } from "@/lib/nutrition";
import { monday } from "@/lib/program-dates";
import { formatDate } from "@/lib/units";

export const REPORT_SECTIONS = {
  training: "Training and attendance",
  results: "Results and personal records",
  benchmarks: "Benchmark progress",
  nutrition: "Nutrition and macro targets",
  goals: "Goal progress",
  recovery: "Check-ins and readiness",
  consistency: "Training consistency",
};

export const NOT_LOGGED = "not logged";

export const weeklyReportInputSchema = z.object({
  start_on: z.iso.date(),
  end_on: z.iso.date(),
  sections: z.record(z.enum(Object.keys(REPORT_SECTIONS) as (keyof typeof REPORT_SECTIONS)[]), z.array(z.object({
    label: z.string(),
    value: z.string(),
  }))),
});
export type WeeklyReportInput = z.infer<typeof weeklyReportInputSchema>;

export const weeklyReportSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  focus: z.array(z.string().trim().min(1).max(240)).min(2).max(3),
});
export type WeeklyReport = z.infer<typeof weeklyReportSchema>;

export function completedReportWeek(today: string) {
  const currentMonday = monday(today);
  return { start_on: addDays(currentMonday, -7), end_on: addDays(currentMonday, -1) };
}

export function formatReportWeek({ start_on, end_on }: Pick<WeeklyReportInput, "start_on" | "end_on">) {
  return `${formatDate(start_on)} – ${formatDate(end_on)}`;
}
